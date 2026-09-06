#!/bin/bash
# Resolves the current node:<major>-alpine / node:<major> tags, independently
# verifies each against upstream (see verify-node-image.sh), and on success
# writes a new entry into trusted-build-images.json. Run only when
# rebuild-native-bindings.sh finds a Node major n8n bundles that isn't
# allowlisted yet — this is the one place a human needs to look at anything
# before it ships, and what they review is this script's PASS/FAIL evidence,
# never a compiled binary.
#
# The allowlist entry does NOT trust node:<major>-alpine / node:<major> as a
# build environment: those images bundle their own npm/node-gyp/compiler
# toolchain, none of which this script verifies, and rebuild-native-bindings.sh
# actually executes that toolchain to produce the shipped binary. Instead this
# resolves the minimal official base image each Node image itself was built
# FROM (per its own OCI base-image annotations — e.g. alpine:3.24), pins that
# by digest, and records the verified Node tarball's URL+checksum so the
# rebuild can extract Node itself from the exact bytes verify-node-image.sh
# already proved authentic, rather than from that image's own bundled copy.
# node:<major> (glibc) is still pinned separately purely as a detection
# target (a `require()` check, not a build environment) — there's no real
# glibc-based n8n image to test against instead (see rebuild-native-bindings.sh).
#
# Usage: propose-trusted-image.sh <node-major>
set -eo pipefail

MAJOR="$1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOWLIST="$ROOT/scripts/trusted-build-images.json"

# Prints: <manifest-digest> <base-image-name> <base-image-digest>
inspect_amd64() {
	docker buildx imagetools inspect "$1" --format '{{json .}}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
manifests = d['manifest'].get('manifests', [d['manifest']])
for m in manifests:
	plat = m.get('platform', {})
	if plat.get('architecture') == 'amd64' and plat.get('os') == 'linux':
		ann = m.get('annotations', {})
		print(m['digest'])
		print(ann.get('org.opencontainers.image.base.name', ''))
		print(ann.get('org.opencontainers.image.base.digest', ''))
		break
"
}

MUSL_TAG="node:${MAJOR}-alpine"
GLIBC_TAG="node:${MAJOR}"

readarray -t MUSL_INFO < <(inspect_amd64 "$MUSL_TAG")
MUSL_DIGEST="${MUSL_INFO[0]}"
MUSL_BASE_IMAGE="${MUSL_INFO[1]}" # e.g. alpine:3.24 — minimal already, used as-is

readarray -t GLIBC_INFO < <(inspect_amd64 "$GLIBC_TAG")
GLIBC_DIGEST="${GLIBC_INFO[0]}"
GLIBC_BASE_NAME="${GLIBC_INFO[1]}" # e.g. buildpack-deps:trixie
# node:<major> builds Node from source on some platforms, hence the heavier
# buildpack-deps base; we only need to compile a small addon, so use the
# plain, more minimal official Debian image for the same release instead —
# same glibc version (compatibility with node:<major>'s own binary), smaller
# trust surface than adopting buildpack-deps wholesale.
DEBIAN_CODENAME="${GLIBC_BASE_NAME##*:}"
GLIBC_BUILD_BASE="debian:${DEBIAN_CODENAME}-slim"

if [ -z "$MUSL_BASE_IMAGE" ] || [ -z "$DEBIAN_CODENAME" ]; then
	echo "FAIL: could not resolve a base-image annotation for ${MUSL_TAG} or ${GLIBC_TAG}" >&2
	exit 1
fi

readarray -t MUSL_BUILD_BASE_INFO < <(inspect_amd64 "$MUSL_BASE_IMAGE")
MUSL_BUILD_BASE_DIGEST="${MUSL_BUILD_BASE_INFO[0]}"
readarray -t GLIBC_BUILD_BASE_INFO < <(inspect_amd64 "$GLIBC_BUILD_BASE")
GLIBC_BUILD_BASE_DIGEST="${GLIBC_BUILD_BASE_INFO[0]}"

echo "Verifying ${MUSL_TAG}@${MUSL_DIGEST} ..."
MUSL_VERIFY=$(bash "$ROOT/scripts/verify-node-image.sh" musl "${MUSL_TAG}@${MUSL_DIGEST}")
MUSL_VERSION=$(grep -oP '^node_version=\K.*' <<<"$MUSL_VERIFY")
MUSL_TARBALL_URL=$(grep -oP '^node_tarball_url=\K.*' <<<"$MUSL_VERIFY")
MUSL_TARBALL_SHA256=$(grep -oP '^node_tarball_sha256=\K.*' <<<"$MUSL_VERIFY")

echo "Verifying ${GLIBC_TAG}@${GLIBC_DIGEST} ..."
GLIBC_VERIFY=$(bash "$ROOT/scripts/verify-node-image.sh" glibc "${GLIBC_TAG}@${GLIBC_DIGEST}")
GLIBC_VERSION=$(grep -oP '^node_version=\K.*' <<<"$GLIBC_VERIFY")
GLIBC_TARBALL_URL=$(grep -oP '^node_tarball_url=\K.*' <<<"$GLIBC_VERIFY")
GLIBC_TARBALL_SHA256=$(grep -oP '^node_tarball_sha256=\K.*' <<<"$GLIBC_VERIFY")

# A verified image reporting the wrong major would otherwise get silently
# stored under this major, and rebuild-native-bindings.sh would later build
# with a mismatched Node/V8 ABI.
for v in "$MUSL_VERSION" "$GLIBC_VERSION"; do
	case "$v" in
	"${MAJOR}".*) ;;
	*)
		echo "FAIL: verified Node version ${v} does not match expected major ${MAJOR}" >&2
		exit 1
		;;
	esac
done

python3 - "$ALLOWLIST" "$MAJOR" \
	"$MUSL_VERSION" "$MUSL_TARBALL_URL" "$MUSL_TARBALL_SHA256" "$MUSL_BASE_IMAGE" "$MUSL_BUILD_BASE_DIGEST" \
	"$GLIBC_VERSION" "$GLIBC_TARBALL_URL" "$GLIBC_TARBALL_SHA256" "$GLIBC_BUILD_BASE" "$GLIBC_BUILD_BASE_DIGEST" \
	"$GLIBC_TAG" "$GLIBC_DIGEST" <<'PYEOF'
import datetime
import json
import sys

(path, major,
 musl_version, musl_tarball_url, musl_tarball_sha256, musl_base_image, musl_base_digest,
 glibc_version, glibc_tarball_url, glibc_tarball_sha256, glibc_build_base, glibc_build_base_digest,
 glibc_detection_image, glibc_detection_digest) = sys.argv[1:15]

try:
	with open(path) as f:
		data = json.load(f)
except FileNotFoundError:
	data = {}

data[major] = {
	"musl": {
		"nodeVersion": musl_version,
		"nodeTarballUrl": musl_tarball_url,
		"nodeTarballSha256": musl_tarball_sha256,
		"buildBaseImage": musl_base_image,
		"buildBaseDigest": musl_base_digest,
	},
	"glibc": {
		"nodeVersion": glibc_version,
		"nodeTarballUrl": glibc_tarball_url,
		"nodeTarballSha256": glibc_tarball_sha256,
		"buildBaseImage": glibc_build_base,
		"buildBaseDigest": glibc_build_base_digest,
		"detectionImage": glibc_detection_image,
		"detectionDigest": glibc_detection_digest,
	},
	"verifiedAt": datetime.date.today().isoformat(),
}
with open(path, "w") as f:
	json.dump(data, f, indent=2, sort_keys=True)
	f.write("\n")
PYEOF

echo "Added Node major ${MAJOR} to $(basename "$ALLOWLIST")"
