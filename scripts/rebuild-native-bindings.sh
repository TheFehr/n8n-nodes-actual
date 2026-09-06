#!/bin/bash
# Detects whether the vendored better-sqlite3 native bindings (see PR #116) still
# load against n8nio/n8n:latest's current Node/V8 ABI, and rebuilds+replaces
# whichever one doesn't. n8n's base image moves independently of this repo's
# releases, so the ABI can drift (see PR #290) without any npm version bump the
# nightly job's version:check would otherwise catch.
#
# Build images are pinned by digest via trusted-build-images.json (see
# propose-trusted-image.sh / verify-node-image.sh) rather than resolved from a
# floating tag at build time — a compromised build image would inject
# malicious code straight into a binary this repo ships to every user of the
# node, so only a digest a human has independently verified against upstream
# is trusted for that role. n8nio/n8n:latest itself stays floating: it's only
# ever used to read process.version for ABI detection below, nothing is built
# inside it or copied out of it.
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/better-sqlite3"
SRC_DIR="$REPO_ROOT/node_modules/better-sqlite3"
ALLOWLIST="$REPO_ROOT/scripts/trusted-build-images.json"
CHANGED=false

MUSL_IMAGE="n8nio/n8n:latest"
NODE_MAJOR=$(docker run --rm --entrypoint node "$MUSL_IMAGE" -e "process.stdout.write(process.version.slice(1).split('.')[0])")
echo "n8n bundles Node ${NODE_MAJOR}."

ENTRY=$(python3 -c "
import json
try:
	with open('$ALLOWLIST') as f:
		data = json.load(f)
except FileNotFoundError:
	data = {}
print(json.dumps(data.get('$NODE_MAJOR', {})))
")

if [ "$ENTRY" = "{}" ]; then
	echo "No trusted build image is vetted yet for Node major ${NODE_MAJOR} — skipping the rebuild."
	echo "Run scripts/propose-trusted-image.sh ${NODE_MAJOR} to vet and allowlist one."
	if [ -n "${GITHUB_OUTPUT:-}" ]; then
		echo "needs_new_image_major=${NODE_MAJOR}" >>"$GITHUB_OUTPUT"
		echo "bindings_changed=false" >>"$GITHUB_OUTPUT"
	fi
	exit 0
fi

MUSL_BUILD_IMAGE=$(echo "$ENTRY" | python3 -c "import json, sys; d = json.load(sys.stdin); print(d['musl']['image'] + '@' + d['musl']['digest'])")
GLIBC_IMAGE=$(echo "$ENTRY" | python3 -c "import json, sys; d = json.load(sys.stdin); print(d['glibc']['image'] + '@' + d['glibc']['digest'])")

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
	echo "needs_new_image_major=" >>"$GITHUB_OUTPUT"
fi
