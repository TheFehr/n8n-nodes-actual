# Shared by check-native-bindings.sh (safe, read-only, runs unattended on the
# nightly schedule) and rebuild-native-bindings.sh (build-capable — installs
# packages and compiles code from a pinned base image — runs only via the
# manually-triggered apply-nightly-fix workflow). Keep this file itself free
# of anything that installs packages or executes untrusted code: both
# detection and the actual fix source it.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/better-sqlite3"
ALLOWLIST="$REPO_ROOT/scripts/trusted-build-images.json"
MUSL_IMAGE="n8nio/n8n:latest"

# Reads the bundled node binary's version string without ever executing it:
# `docker create`/`docker export` only materialize and stream the image's
# filesystem layers, they don't run its entrypoint — unlike `docker run`,
# which would execute whatever `node` binary this floating, unpinned tag
# currently resolves to.
#
# Fails loudly (nonzero return, empty stdout) rather than silently returning
# an empty major on any failure. This matters because `set -e` in the caller
# does NOT catch a failure inside a function invoked via command
# substitution (verified: `x=$(f)` under `set -e`, where `f` runs `false`,
# does not abort — bash only disables that exemption with `inherit_errexit`,
# which isn't set here) — so every risky step below is checked explicitly,
# and callers must check this function's own exit status too, e.g.
# `NODE_MAJOR=$(resolve_node_major) || exit 1`.
resolve_node_major() {
	local cid version
	cid=$(docker create "$MUSL_IMAGE") || return 1
	version=$(docker export "$cid" | tar -xO usr/bin/node | strings | grep -oP '^v\K\d+\.\d+\.\d+$' | head -1)
	docker rm "$cid" >/dev/null
	if [ -z "$version" ]; then
		echo "resolve_node_major: failed to read a version string from ${MUSL_IMAGE}" >&2
		return 1
	fi
	echo "${version%%.*}"
}

# Prints the allowlist entry for a Node major as JSON, or "{}" if unvetted.
allowlist_entry() {
	python3 -c "
import json
try:
	with open('$ALLOWLIST') as f:
		data = json.load(f)
except FileNotFoundError:
	data = {}
print(json.dumps(data.get('$1', {})))
"
}

# $1 = JSON entry (as from allowlist_entry), $2 = python dict-access expr, e.g. "['musl']['buildBaseImage']"
field() { python3 -c "import json, sys; print(json.load(sys.stdin)$2)" <<<"$1"; }

# A require() check against an already-vendored binary inside an official,
# unmodified image — no package installation, no compilation, nothing
# untrusted executed. Safe to run unattended.
binding_loads() {
	local image="$1" binary_dir="$2"
	docker run --rm -v "${binary_dir}:/check:ro" --entrypoint node "$image" \
		-e "require('/check/better_sqlite3.node')" >/dev/null 2>&1
}
