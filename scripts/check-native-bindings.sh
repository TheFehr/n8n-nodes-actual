#!/bin/bash
# Safe to run unattended on a schedule: only ever pulls n8nio/n8n:latest and
# an already-vetted, digest-pinned node:<major> image to run a require()
# check against the CURRENTLY vendored binaries — never installs packages or
# compiles anything.
#
# The actual rebuild (rebuild-native-bindings.sh) installs packages from live
# repositories and compiles code inside a pinned base image — a real,
# unavoidable trust surface no amount of binary inspection afterwards can
# meaningfully vet (a backdoored .node file looks exactly like a clean one).
# What actually matters is *when* that step runs: unattended, on a public,
# predictable schedule, an attacker can plan around it; run only via a human
# consciously triggering apply-nightly-fix.yml at a moment of their choosing,
# they can't. So this script never builds anything itself — it only decides
# whether the tracking issue needs opening or updating.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-native-bindings.sh
source "$SCRIPT_DIR/lib-native-bindings.sh"

NODE_MAJOR=$(resolve_node_major) || exit 1
echo "n8n bundles Node ${NODE_MAJOR}."

ENTRY=$(allowlist_entry "$NODE_MAJOR")
REASONS=()

if [ "$ENTRY" = "{}" ]; then
	REASONS+=("Node major ${NODE_MAJOR} has no vetted build image yet in trusted-build-images.json — run scripts/propose-trusted-image.sh ${NODE_MAJOR} via the apply-nightly-fix workflow.")
else
	GLIBC_DETECTION_IMAGE="$(field "$ENTRY" "['glibc']['detectionImage']")@$(field "$ENTRY" "['glibc']['detectionDigest']")"

	# binding_loads distinguishes "docker itself couldn't run the container"
	# (pull failure, daemon error, a bad/missing allowlist field — an
	# infrastructure problem, not an ABI one) from a genuine load failure, so
	# the reported reason points at the actual cause rather than always
	# blaming ABI drift and sending a human toward a rebuild that won't help.
	report_binding_check() {
		local label="$1" image="$2" binary_dir="$3" kind
		kind=$(binding_loads "$image" "$binary_dir") || {
			if [ "$kind" = infra ]; then
				REASONS+=("Could not even run the ${label} check container against ${image} — a Docker/infrastructure failure, not necessarily an ABI problem. See the workflow run log.")
			else
				REASONS+=("${label} binding no longer loads against Node ${NODE_MAJOR}'s ABI.")
			fi
		}
	}

	report_binding_check "linux-x64-musl" "$MUSL_IMAGE" "$VENDOR_DIR/linux-x64-musl"
	report_binding_check "linux-x64-glibc" "$GLIBC_DETECTION_IMAGE" "$VENDOR_DIR/linux-x64-glibc"
fi

if [ ${#REASONS[@]} -gt 0 ]; then
	echo "Needs attention:"
	printf ' - %s\n' "${REASONS[@]}"
	if [ -n "${GITHUB_OUTPUT:-}" ]; then
		echo "needs_attention=true" >>"$GITHUB_OUTPUT"
		{
			echo "reasons<<BINDINGS_EOF"
			printf -- '- %s\n' "${REASONS[@]}"
			echo "BINDINGS_EOF"
		} >>"$GITHUB_OUTPUT"
	fi
else
	echo "Vendored native bindings still match the current ABI; nothing to do."
	if [ -n "${GITHUB_OUTPUT:-}" ]; then
		echo "needs_attention=false" >>"$GITHUB_OUTPUT"
		echo "reasons=" >>"$GITHUB_OUTPUT"
	fi
fi
