#!/bin/bash
# Detects whether the vendored better-sqlite3 native bindings (see PR #116) still
# load against n8nio/n8n:latest's current Node/V8 ABI, and rebuilds+replaces
# whichever one doesn't. n8n's base image moves independently of this repo's
# releases, so the ABI can drift (see PR #290) without any npm version bump the
# nightly job's version:check would otherwise catch.
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/better-sqlite3"
SRC_DIR="$REPO_ROOT/node_modules/better-sqlite3"
CHANGED=false

# n8nio/n8n:latest is the exact image Dockerfile.test-n8n runs against, so it's
# ground truth for the musl target. There's no current canonical glibc-based n8n
# image (n8nio/n8n:latest-debian on Docker Hub is a stale, unmaintained tag), so
# the glibc target is checked/rebuilt against a plain node:<major> image matching
# n8n's bundled Node major version instead — NODE_MODULE_VERSION is fixed per
# Node major release regardless of OS/libc, so this is a reliable proxy.
MUSL_IMAGE="n8nio/n8n:latest"
NODE_MAJOR=$(docker run --rm --entrypoint node "$MUSL_IMAGE" -e "process.stdout.write(process.version.slice(1).split('.')[0])")
GLIBC_IMAGE="node:${NODE_MAJOR}"
MUSL_BUILD_IMAGE="node:${NODE_MAJOR}-alpine"

echo "n8n bundles Node ${NODE_MAJOR}; checking vendored bindings against it..."

binding_loads() {
	local image="$1" binary_dir="$2"
	docker run --rm -v "${binary_dir}:/check:ro" --entrypoint node "$image" \
		-e "require('/check/better_sqlite3.node')" >/dev/null 2>&1
}

rebuild_binding() {
	local build_image="$1" install_build_tools="$2" out_file="$3"
	local work
	work=$(mktemp -d)
	cp -r "$SRC_DIR" "$work/better-sqlite3"
	docker run --rm -v "$work/better-sqlite3:/work" -w /work "$build_image" sh -c "
		set -e
		$install_build_tools
		npm run build-release >/dev/null
	"
	cp "$work/better-sqlite3/build/Release/better_sqlite3.node" "$out_file"
	chmod 755 "$out_file"
	# The build container runs as root, so it leaves root-owned files behind;
	# fix ownership before rm -rf so cleanup doesn't fail as the runner user.
	docker run --rm -v "$work:/work" alpine chown -R "$(id -u):$(id -g)" /work >/dev/null
	rm -rf "$work"
}

if ! binding_loads "$MUSL_IMAGE" "$VENDOR_DIR/linux-x64-musl"; then
	echo "linux-x64-musl binding is stale for Node ${NODE_MAJOR}'s ABI — rebuilding..."
	rebuild_binding "$MUSL_BUILD_IMAGE" "apk add --no-cache python3 make g++ >/dev/null" \
		"$VENDOR_DIR/linux-x64-musl/better_sqlite3.node"
	CHANGED=true
fi

if ! binding_loads "$GLIBC_IMAGE" "$VENDOR_DIR/linux-x64-glibc"; then
	echo "linux-x64-glibc binding is stale for Node ${NODE_MAJOR}'s ABI — rebuilding..."
	rebuild_binding "$GLIBC_IMAGE" "apt-get update >/dev/null && apt-get install -y python3 make g++ >/dev/null" \
		"$VENDOR_DIR/linux-x64-glibc/better_sqlite3.node"
	CHANGED=true
fi

if [ "$CHANGED" = true ]; then
	echo "Vendored native bindings were rebuilt."
else
	echo "Vendored native bindings still match the current ABI; nothing to do."
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
	echo "bindings_changed=$CHANGED" >>"$GITHUB_OUTPUT"
fi
