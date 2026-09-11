// Runs right before nightly-version-bump.yml hands the working tree to
// create-pull-request, which snapshots whatever's dirty and auto-merges it
// with no human review. That's fine for the diff update-versions.mjs
// actually produces — but npm ci (run earlier, in the untrusted prepare
// job) executes lifecycle scripts from the locked dependencies, which could
// tamper with any tracked file. This doesn't try to prevent that tampering
// at its source; it validates the *result* against the exact, known shape
// of a legitimate version bump, and fails loudly if anything else changed,
// regardless of where it came from.
//
// package-lock.json is deliberately NOT in the allowed set here: checking
// only its root "name" field (an earlier version of this script did) can't
// catch a lifecycle script swapping a dependency's resolved tarball/
// integrity, or repointing devDependencies["@actual-app/api"] at a git URL
// or an "npm:other-package@version" alias instead of a real version — npm
// accepts any of those as a valid dependency value, and nothing here could
// tell the difference from a legitimate bump by inspecting the file alone.
// So the untrusted job no longer uploads package-lock.json at all; once
// this validator confirms package.json's new values are themselves sane
// semver strings, the trusted job regenerates the lockfile fresh, itself,
// with lifecycle scripts disabled — see nightly-version-bump.yml.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

function gitShowHead(path) {
	try {
		return execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" });
	} catch {
		return null; // path didn't exist at HEAD
	}
}

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;
const SEMVER_RE = new RegExp(`^${SEMVER}$`);

const ALLOWED_PATHS = new Set(["README.md", "package.json"]);

const changedFiles = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" })
	.split("\n")
	.filter(Boolean);

if (changedFiles.length === 0) {
	console.log("No changes to validate.");
	process.exit(0);
}

for (const file of changedFiles) {
	if (!ALLOWED_PATHS.has(file)) {
		fail(`unexpected file changed: ${file} (only ${[...ALLOWED_PATHS].join(", ")} are expected here)`);
	}
}

// README.md: exactly the one compatibility sentence update-versions.mjs
// writes, byte-identical everywhere else.
if (changedFiles.includes("README.md")) {
	const before = gitShowHead("README.md");
	const after = readFileSync("README.md", "utf8");
	const regex = new RegExp(
		`This was developed for version (${SEMVER}) of n8n and version (${SEMVER}) of Actual\\.`,
	);
	const beforeStripped = before.replace(regex, "\0");
	const afterStripped = after.replace(regex, "\0");
	if (beforeStripped !== afterStripped) {
		fail("README.md changed outside the compatibility sentence");
	}
	if (!regex.test(before) || !regex.test(after)) {
		fail("README.md's compatibility sentence is missing before or after the change");
	}
}

// package.json: only n8nWorkflowVersion and/or devDependencies["@actual-app/api"]
// may differ, structurally (parsed JSON, not text) — anything else, at any
// depth, fails. Their new values must also themselves be plain semver
// strings — not a git URL, tarball URL, or "npm:other-package@version"
// alias, all of which npm accepts as a dependency value just as readily as
// a real version, and none of which update-versions.mjs would ever produce.
if (changedFiles.includes("package.json")) {
	const before = JSON.parse(gitShowHead("package.json"));
	const after = JSON.parse(readFileSync("package.json", "utf8"));
	const allowedTopLevel = new Set(["n8nWorkflowVersion", "devDependencies"]);
	const beforeKeys = new Set(Object.keys(before));
	const afterKeys = new Set(Object.keys(after));
	for (const key of new Set([...beforeKeys, ...afterKeys])) {
		if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
		if (!allowedTopLevel.has(key)) {
			fail(`package.json: unexpected top-level field changed: ${key}`);
		}
	}
	if (JSON.stringify(before.n8nWorkflowVersion) !== JSON.stringify(after.n8nWorkflowVersion)) {
		if (typeof after.n8nWorkflowVersion !== "string" || !SEMVER_RE.test(after.n8nWorkflowVersion)) {
			fail(`package.json: n8nWorkflowVersion did not change to a plain semver string: ${JSON.stringify(after.n8nWorkflowVersion)}`);
		}
	}
	const beforeDeps = before.devDependencies ?? {};
	const afterDeps = after.devDependencies ?? {};
	const depKeys = new Set([...Object.keys(beforeDeps), ...Object.keys(afterDeps)]);
	for (const key of depKeys) {
		if (beforeDeps[key] === afterDeps[key]) continue;
		if (key !== "@actual-app/api") {
			fail(`package.json: unexpected devDependencies field changed: ${key}`);
		}
		if (typeof afterDeps[key] !== "string" || !SEMVER_RE.test(afterDeps[key])) {
			fail(`package.json: devDependencies["@actual-app/api"] did not change to a plain semver string: ${JSON.stringify(afterDeps[key])}`);
		}
	}
}

console.log(`OK: diff matches the expected shape of a version bump (${changedFiles.join(", ")}).`);
