#!/bin/bash
# Resolves the current node:<major>-alpine / node:<major> tags to their
# current digests, independently verifies each against upstream (see
# verify-node-image.sh), and on success writes a new entry into
# trusted-build-images.json. Run only when rebuild-native-bindings.sh finds a
# Node major n8n bundles that isn't allowlisted yet — this is the one place a
# human needs to look at anything before it ships, and what they review is
# this script's PASS/FAIL evidence, never a compiled binary.
#
# Usage: propose-trusted-image.sh <node-major>
set -eo pipefail

MAJOR="$1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOWLIST="$ROOT/scripts/trusted-build-images.json"

resolve_amd64_digest() {
	docker buildx imagetools inspect "$1" --format '{{json .}}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
manifests = d['manifest'].get('manifests', [d['manifest']])
for m in manifests:
	plat = m.get('platform', {})
	if plat.get('architecture') == 'amd64' and plat.get('os') == 'linux':
		print(m['digest'])
		break
"
}

MUSL_TAG="node:${MAJOR}-alpine"
GLIBC_TAG="node:${MAJOR}"

MUSL_DIGEST=$(resolve_amd64_digest "$MUSL_TAG")
GLIBC_DIGEST=$(resolve_amd64_digest "$GLIBC_TAG")

echo "Verifying ${MUSL_TAG}@${MUSL_DIGEST} ..."
MUSL_VERSION=$(bash "$ROOT/scripts/verify-node-image.sh" musl "${MUSL_TAG}@${MUSL_DIGEST}" | grep -oP 'node_version=\K.*')

echo "Verifying ${GLIBC_TAG}@${GLIBC_DIGEST} ..."
GLIBC_VERSION=$(bash "$ROOT/scripts/verify-node-image.sh" glibc "${GLIBC_TAG}@${GLIBC_DIGEST}" | grep -oP 'node_version=\K.*')

python3 - "$ALLOWLIST" "$MAJOR" "$MUSL_TAG" "$MUSL_DIGEST" "$MUSL_VERSION" "$GLIBC_TAG" "$GLIBC_DIGEST" "$GLIBC_VERSION" <<'PYEOF'
import datetime
import json
import sys

path, major, musl_image, musl_digest, musl_version, glibc_image, glibc_digest, glibc_version = sys.argv[1:9]
try:
	with open(path) as f:
		data = json.load(f)
except FileNotFoundError:
	data = {}

data[major] = {
	"musl": {"image": musl_image, "digest": musl_digest, "nodeVersion": musl_version},
	"glibc": {"image": glibc_image, "digest": glibc_digest, "nodeVersion": glibc_version},
	"verifiedAt": datetime.date.today().isoformat(),
}
with open(path, "w") as f:
	json.dump(data, f, indent=2, sort_keys=True)
	f.write("\n")
PYEOF

echo "Added Node major ${MAJOR} to $(basename "$ALLOWLIST")"
