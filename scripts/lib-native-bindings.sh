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

resolve_node_major() {
	docker run --rm --entrypoint node "$MUSL_IMAGE" -e "process.stdout.write(process.version.slice(1).split('.')[0])"
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
