#!/bin/bash
# Detects whether the vendored better-sqlite3 native bindings (see PR #116) still
# load against n8nio/n8n:latest's current Node/V8 ABI, and rebuilds+replaces
# whichever one doesn't. n8n's base image moves independently of this repo's
# releases, so the ABI can drift (see PR #290) without any npm version bump the
# nightly job's version:check would otherwise catch.
#
# Builds happen inside a minimal, independently-pinned base image (alpine:X /
# debian:X-slim, see trusted-build-images.json), with Node itself extracted
# from the exact tarball verify-node-image.sh already proved byte-identical
# to Node's own published release — never inside node:<major>-alpine /
# node:<major> directly. Those images bundle their own npm/node-gyp/compiler
# toolchain, none of which is verified anywhere in this pipeline, and it's
# that toolchain — not just the `node` binary — that actually produces the
# binary this repo ships to every user of the node. n8nio/n8n:latest itself
# stays floating and is only ever used to read process.version for ABI
# detection below; nothing is built inside it or copied out of it.
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

field() { echo "$ENTRY" | python3 -c "import json, sys; print(json.load(sys.stdin)$1)"; }

GLIBC_DETECTION_IMAGE="$(field "['glibc']['detectionImage']")@$(field "['glibc']['detectionDigest']")"

binding_loads() {
	local image="$1" binary_dir="$2"
	docker run --rm -v "${binary_dir}:/check:ro" --entrypoint node "$image" \
		-e "require('/check/better_sqlite3.node')" >/dev/null 2>&1
}

# Compiles better-sqlite3 inside a minimal base image, using Node extracted
# from an independently verified tarball rather than any toolchain bundled in
# a Node-branded image.
rebuild_binding() {
	local base_image="$1" install_build_tools="$2" tarball_url="$3" tarball_sha256="$4" out_file="$5"
	local work tarball_name
	work=$(mktemp -d)
	tarball_name=$(basename "$tarball_url")
	cp -r "$SRC_DIR" "$work/better-sqlite3"
	docker run --rm -v "$work/better-sqlite3:/work" -w /work "$base_image" sh -c "
		set -e
		$install_build_tools
		curl -fsSLO '$tarball_url'
		echo '$tarball_sha256  $tarball_name' | sha256sum -c -
		tar -xzf '$tarball_name' --strip-components=1 -C /usr/local
		export PATH=/usr/local/bin:\$PATH
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
	rebuild_binding \
		"$(field "['musl']['buildBaseImage']")@$(field "['musl']['buildBaseDigest']")" \
		"apk add --no-cache python3 make g++ curl >/dev/null" \
		"$(field "['musl']['nodeTarballUrl']")" "$(field "['musl']['nodeTarballSha256']")" \
		"$VENDOR_DIR/linux-x64-musl/better_sqlite3.node"
	CHANGED=true
fi

if ! binding_loads "$GLIBC_DETECTION_IMAGE" "$VENDOR_DIR/linux-x64-glibc"; then
	echo "linux-x64-glibc binding is stale for Node ${NODE_MAJOR}'s ABI — rebuilding..."
	rebuild_binding \
		"$(field "['glibc']['buildBaseImage']")@$(field "['glibc']['buildBaseDigest']")" \
		"apt-get update >/dev/null && apt-get install -y python3 make g++ curl ca-certificates >/dev/null" \
		"$(field "['glibc']['nodeTarballUrl']")" "$(field "['glibc']['nodeTarballSha256']")" \
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
