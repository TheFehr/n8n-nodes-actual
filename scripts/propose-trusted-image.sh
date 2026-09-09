#!/bin/bash
# Resolves the current node:<major>-alpine / node:<major> tags, independently
# verifies each against upstream (see verify-node-image.sh), and on success
# writes a new entry into trusted-build-images.json. Run only when
# check-native-bindings.sh finds a Node major n8n bundles that isn't
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
# It also resolves and pins the exact version of every build-tool package
# (python3/make/g++/curl[/ca-certificates]) available in that pinned base
# image right now, so the nightly rebuild never floats to whatever a live
# package repository happens to serve later.
#
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

# node:<major>'s own OCI annotations are self-reported by that same image —
# never trusted as a literal image reference (a compromised node:<major>
# could point buildBaseImage at anything, and rebuild-native-bindings.sh
# would later run build commands in it). Only the release/codename portion
# is extracted, validated against a strict pattern, and the trusted image
# reference is reconstructed from a hardcoded prefix plus that validated
# portion — the raw annotation value itself is never used as a reference.
resolve_musl_build_base() {
	local annotation="$1" release
	release="${annotation#alpine:}"
	if [[ "$annotation" != "alpine:$release" || ! "$release" =~ ^[0-9]+\.[0-9]+$ ]]; then
		echo "FAIL: musl base-image annotation '$annotation' is not a recognized alpine:<release> — refusing to use it" >&2
		exit 1
	fi
	echo "alpine:${release}"
}

resolve_glibc_build_base() {
	local annotation="$1" codename
	codename="${annotation##*:}"
	if [[ ! "$codename" =~ ^[a-z]+$ ]]; then
		echo "FAIL: glibc base-image annotation '$annotation' has no recognizable Debian codename — refusing to use it" >&2
		exit 1
	fi
	echo "debian:${codename}-slim"
}

# Prints a JSON {package: exact-version} object for the given base image,
# resolved against its live package index right now — this is what gets
# pinned into the allowlist, not re-resolved at build time.
resolve_apk_versions() {
	docker run --rm "$1" sh -c "apk add --no-cache --simulate python3 make g++ curl 2>&1" | python3 -c "
import json, re, sys
pkgs = {}
for line in sys.stdin:
	m = re.match(r'.*Installing (python3|make|g\+\+|curl) \(([^)]+)\)', line)
	if m:
		pkgs[m.group(1)] = m.group(2)
for want in ('python3', 'make', 'g++', 'curl'):
	if want not in pkgs:
		print(f'FAIL: could not resolve an apk version for {want}', file=sys.stderr)
		sys.exit(1)
print(json.dumps(pkgs))
"
}

resolve_apt_versions() {
	docker run --rm "$1" sh -c "apt-get update >/dev/null 2>&1 && apt-cache policy python3 make g++ curl ca-certificates 2>&1" | python3 -c "
import json, sys
pkgs = {}
current = None
for line in sys.stdin:
	line = line.rstrip('\n')
	if line and not line.startswith(' ') and line.endswith(':'):
		current = line[:-1]
	elif current and line.strip().startswith('Candidate:'):
		pkgs[current] = line.split('Candidate:', 1)[1].strip()
		current = None
for want in ('python3', 'make', 'g++', 'curl', 'ca-certificates'):
	if want not in pkgs:
		print(f'FAIL: could not resolve an apt version for {want}', file=sys.stderr)
		sys.exit(1)
print(json.dumps(pkgs))
"
}

MUSL_TAG="node:${MAJOR}-alpine"
GLIBC_TAG="node:${MAJOR}"

readarray -t MUSL_INFO < <(inspect_amd64 "$MUSL_TAG")
MUSL_DIGEST="${MUSL_INFO[0]}"
MUSL_BASE_IMAGE=$(resolve_musl_build_base "${MUSL_INFO[1]}")

readarray -t GLIBC_INFO < <(inspect_amd64 "$GLIBC_TAG")
GLIBC_DIGEST="${GLIBC_INFO[0]}"
# node:<major> builds Node from source on some platforms, hence the heavier
# buildpack-deps base; we only need to compile a small addon, so use the
# plain, more minimal official Debian image for the same release instead —
# same glibc version (compatibility with node:<major>'s own binary), smaller
# trust surface than adopting buildpack-deps wholesale.
GLIBC_BUILD_BASE=$(resolve_glibc_build_base "${GLIBC_INFO[1]}")

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

echo "Resolving exact build-tool package versions against ${MUSL_BASE_IMAGE}@${MUSL_BUILD_BASE_DIGEST} ..."
MUSL_PACKAGES=$(resolve_apk_versions "${MUSL_BASE_IMAGE}@${MUSL_BUILD_BASE_DIGEST}")
echo "Resolving exact build-tool package versions against ${GLIBC_BUILD_BASE}@${GLIBC_BUILD_BASE_DIGEST} ..."
GLIBC_PACKAGES=$(resolve_apt_versions "${GLIBC_BUILD_BASE}@${GLIBC_BUILD_BASE_DIGEST}")

python3 - "$ALLOWLIST" "$MAJOR" \
	"$MUSL_VERSION" "$MUSL_TARBALL_URL" "$MUSL_TARBALL_SHA256" "$MUSL_BASE_IMAGE" "$MUSL_BUILD_BASE_DIGEST" "$MUSL_PACKAGES" \
	"$GLIBC_VERSION" "$GLIBC_TARBALL_URL" "$GLIBC_TARBALL_SHA256" "$GLIBC_BUILD_BASE" "$GLIBC_BUILD_BASE_DIGEST" "$GLIBC_PACKAGES" \
	"$GLIBC_TAG" "$GLIBC_DIGEST" <<'PYEOF'
import datetime
import json
import sys

(path, major,
 musl_version, musl_tarball_url, musl_tarball_sha256, musl_base_image, musl_base_digest, musl_packages,
 glibc_version, glibc_tarball_url, glibc_tarball_sha256, glibc_build_base, glibc_build_base_digest, glibc_packages,
 glibc_detection_image, glibc_detection_digest) = sys.argv[1:17]

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
		"buildPackages": json.loads(musl_packages),
	},
	"glibc": {
		"nodeVersion": glibc_version,
		"nodeTarballUrl": glibc_tarball_url,
		"nodeTarballSha256": glibc_tarball_sha256,
		"buildBaseImage": glibc_build_base,
		"buildBaseDigest": glibc_build_base_digest,
		"buildPackages": json.loads(glibc_packages),
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
