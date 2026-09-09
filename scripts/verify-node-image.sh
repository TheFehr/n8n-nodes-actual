#!/bin/bash
# Independently proves that a pinned Node Docker image's actual `node` binary
# is byte-identical to what Node.js's own release infrastructure published for
# that version — not just "the image's tag or metadata claims so". Run this
# (via propose-trusted-image.sh) whenever vetting a new entry for
# trusted-build-images.json; nightly builds trust the already-vetted digest
# and don't re-run this every night.
#
# glibc images get full cryptographic assurance: nodejs.org/dist publishes a
# GPG-signed SHASUMS256.txt.asc, verified here against release keys in
# nodejs-release-gpg-fingerprints.txt (never against keys extracted from the
# image's own provenance — that would let a tampered image vouch for itself).
#
# musl/Alpine images are weaker by construction: Node's official Alpine builds
# ship from unofficial-builds.nodejs.org, which has no signed checksum file at
# all (only bare HTTPS-served SHASUMS256.txt) — a known, long-standing
# limitation of Node's own Alpine images, not something this script can
# strengthen beyond HTTPS transport trust in that host.
#
# Also prints the verified tarball's URL and checksum (node_tarball_url=,
# node_tarball_sha256=) so propose-trusted-image.sh can record them: the
# nightly rebuild extracts Node from this exact verified tarball itself,
# rather than trusting whatever npm/node-gyp/node happens to be bundled
# inside the Docker image used to run the check above — that image's own
# toolchain is never used to produce anything this repo ships.
#
# Usage: verify-node-image.sh <musl|glibc> <image-ref@sha256:digest>
set -eo pipefail

LIBC="$1"
IMAGE="$2"
FPR_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nodejs-release-gpg-fingerprints.txt"

if [ "$LIBC" != "musl" ] && [ "$LIBC" != "glibc" ]; then
	echo "usage: $0 <musl|glibc> <image@digest>" >&2
	exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# -L follows redirects but doesn't otherwise constrain them: an HTTPS URL
# could redirect to plain HTTP, silently dropping TLS on a connection whose
# response we then trust (the musl checksum file isn't signed at all, so an
# attacker able to force that downgrade could swap in a malicious tarball
# that still passes sha256sum -c). Pin both the initial request and any
# redirect target to HTTPS.
CURL=(curl --proto '=https' --proto-redir '=https')

VERSION=$(docker run --rm --entrypoint node "$IMAGE" -e "process.stdout.write(process.version.slice(1))")
echo "Pinned image reports Node v${VERSION}" >&2

if [ "$LIBC" = "musl" ]; then
	TARBALL="node-v${VERSION}-linux-x64-musl.tar.gz"
	BASE_URL="https://unofficial-builds.nodejs.org/download/release/v${VERSION}"
	echo "NOTE: musl builds ship from $BASE_URL, which has no GPG-signed" >&2
	echo "checksum file — see script header for why that's an inherent limit." >&2
	"${CURL[@]}" -fsSL -o SHASUMS256.txt "$BASE_URL/SHASUMS256.txt"
else
	TARBALL="node-v${VERSION}-linux-x64.tar.gz"
	BASE_URL="https://nodejs.org/dist/v${VERSION}"
	export GNUPGHOME="$WORK/gnupg"
	mkdir -p "$GNUPGHOME" && chmod 700 "$GNUPGHOME"
	while read -r fpr; do
		case "$fpr" in
		\#* | "") continue ;;
		esac
		gpg --batch --keyserver hkps://keys.openpgp.org --recv-keys "$fpr" >/dev/null 2>&1 ||
			gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "$fpr" >/dev/null 2>&1
	done <"$FPR_FILE"
	"${CURL[@]}" -fsSLO "$BASE_URL/SHASUMS256.txt.asc"
	# --decrypt on a signed-only (not encrypted) message verifies the signature
	# and emits the plaintext; the exit code alone doesn't distinguish "good
	# signature" from "no signature at all" across gpg versions, so check the
	# log text explicitly.
	gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc 2>gpg.log || {
		cat gpg.log >&2
		exit 1
	}
	if ! grep -q "^gpg: Good signature from" gpg.log; then
		echo "FAIL: SHASUMS256.txt.asc did not verify against a trusted release key" >&2
		cat gpg.log >&2
		exit 1
	fi
	echo "GPG: $(grep '^gpg: Good signature from' gpg.log)" >&2
fi

"${CURL[@]}" -fsSLO "$BASE_URL/$TARBALL"
TARBALL_SHA256=$(grep " ${TARBALL}\$" SHASUMS256.txt | awk '{print $1}')
if [ -z "$TARBALL_SHA256" ]; then
	echo "FAIL: no checksum entry found for $TARBALL in SHASUMS256.txt" >&2
	exit 1
fi
if ! echo "${TARBALL_SHA256}  ${TARBALL}" | sha256sum -c -; then
	echo "FAIL: downloaded tarball does not match its published checksum" >&2
	exit 1
fi

tar -xzf "$TARBALL" --strip-components=1 -C . "$(basename "$TARBALL" .tar.gz)/bin/node"
UPSTREAM_SHA=$(sha256sum bin/node | cut -d' ' -f1)

CID=$(docker create "$IMAGE")
docker cp "$CID:/usr/local/bin/node" ./node-from-image >/dev/null
docker rm "$CID" >/dev/null
IMAGE_SHA=$(sha256sum node-from-image | cut -d' ' -f1)

echo "Upstream verified node binary sha256: $UPSTREAM_SHA" >&2
echo "Pinned image's node binary sha256:    $IMAGE_SHA" >&2

if [ "$UPSTREAM_SHA" != "$IMAGE_SHA" ]; then
	echo "FAIL: $IMAGE's node binary does not match the independently verified upstream artifact" >&2
	exit 1
fi

echo "PASS: $IMAGE's node binary is byte-identical to the verified upstream v${VERSION} ${LIBC} artifact" >&2
echo "node_version=${VERSION}"
echo "node_tarball_url=${BASE_URL}/${TARBALL}"
echo "node_tarball_sha256=${TARBALL_SHA256}"
