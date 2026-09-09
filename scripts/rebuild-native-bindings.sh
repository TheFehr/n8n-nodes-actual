#!/bin/bash
# Rebuilds the vendored better-sqlite3 native bindings (see PR #116) whenever
# check-native-bindings.sh has found one stale. This is the build-capable,
# untrusted-toolchain-executing half of the pipeline — it installs packages
# and compiles code inside a pinned base image — so it only ever runs via the
# manually-triggered apply-nightly-fix workflow, never on a schedule; see
# check-native-bindings.sh for why.
#
# Builds happen inside a minimal, independently-pinned base image (alpine:X /
# debian:X-slim, see trusted-build-images.json), with Node itself extracted
# from the exact tarball verify-node-image.sh already proved byte-identical
# to Node's own published release, and build-tool packages installed at the
# exact versions propose-trusted-image.sh resolved and pinned when the entry
# was vetted — never inside node:<major>-alpine / node:<major> directly, and
# never at whatever version a live package repository happens to serve on
# the night this runs. Those images bundle their own npm/node-gyp/compiler
# toolchain, none of which is verified anywhere in this pipeline, and it's
# that toolchain — not just the `node` binary — that actually produces the
# binary this repo ships to every user of the node. n8nio/n8n:latest itself
# stays floating and is only ever used to read process.version for ABI
# detection below; nothing is built inside it or copied out of it.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-native-bindings.sh
source "$SCRIPT_DIR/lib-native-bindings.sh"
SRC_DIR="$REPO_ROOT/node_modules/better-sqlite3"
CHANGED=false

NODE_MAJOR=$(resolve_node_major) || exit 1
echo "n8n bundles Node ${NODE_MAJOR}."

ENTRY=$(allowlist_entry "$NODE_MAJOR")

if [ "$ENTRY" = "{}" ]; then
	echo "No trusted build image is vetted yet for Node major ${NODE_MAJOR} — skipping the rebuild."
	echo "Run scripts/propose-trusted-image.sh ${NODE_MAJOR} to vet and allowlist one."
	if [ -n "${GITHUB_OUTPUT:-}" ]; then
		echo "needs_new_image_major=${NODE_MAJOR}" >>"$GITHUB_OUTPUT"
		echo "bindings_changed=false" >>"$GITHUB_OUTPUT"
	fi
	exit 0
fi

GLIBC_DETECTION_IMAGE="$(field "$ENTRY" "['glibc']['detectionImage']")@$(field "$ENTRY" "['glibc']['detectionDigest']")"

# $1 = 'musl' or 'glibc' -> prints "pkg=version pkg=version ..." for apk/apt.
packages_install_args() {
	python3 -c "
import json, sys
d = json.load(sys.stdin)
pkgs = d['$1']['buildPackages']
print(' '.join(f'{k}={v}' for k, v in pkgs.items()))
" <<<"$ENTRY"
}

# Compiles better-sqlite3 inside a minimal base image, using Node extracted
# from an independently verified tarball and build-tool packages pinned to
# exact, previously-resolved versions — never a toolchain bundled in a
# Node-branded image, never whatever a live repo serves on the day.
rebuild_binding() {
	local base_image="$1" install_build_tools="$2" tarball_url="$3" tarball_sha256="$4" out_file="$5"
	local work tarball_name
	work=$(mktemp -d)
	tarball_name=$(basename "$tarball_url")
	cp -r "$SRC_DIR" "$work/better-sqlite3"
	docker run --rm -v "$work/better-sqlite3:/work" -w /work "$base_image" sh -c "
		set -e
		$install_build_tools
		curl --proto '=https' --proto-redir '=https' -fsSLO '$tarball_url'
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
		"$(field "$ENTRY" "['musl']['buildBaseImage']")@$(field "$ENTRY" "['musl']['buildBaseDigest']")" \
		"apk add --no-cache $(packages_install_args musl) >/dev/null" \
		"$(field "$ENTRY" "['musl']['nodeTarballUrl']")" "$(field "$ENTRY" "['musl']['nodeTarballSha256']")" \
		"$VENDOR_DIR/linux-x64-musl/better_sqlite3.node"
	CHANGED=true
fi

if ! binding_loads "$GLIBC_DETECTION_IMAGE" "$VENDOR_DIR/linux-x64-glibc"; then
	echo "linux-x64-glibc binding is stale for Node ${NODE_MAJOR}'s ABI — rebuilding..."
	rebuild_binding \
		"$(field "$ENTRY" "['glibc']['buildBaseImage']")@$(field "$ENTRY" "['glibc']['buildBaseDigest']")" \
		"apt-get update >/dev/null && apt-get install -y $(packages_install_args glibc) >/dev/null" \
		"$(field "$ENTRY" "['glibc']['nodeTarballUrl']")" "$(field "$ENTRY" "['glibc']['nodeTarballSha256']")" \
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
