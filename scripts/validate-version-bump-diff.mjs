// Runs right before nightly-version-bump.yml hands the working tree to
// create-pull-request, which snapshots whatever's dirty and auto-merges it
// with no human review. That's fine for the diff update-versions.mjs
// actually produces — but npm ci (run earlier in the same job, with write
// credentials live) executes lifecycle scripts from the locked
// dependencies, which could tamper with any tracked file. This doesn't try
// to prevent that tampering at its source; it validates the *result*
// against the exact, known shape of a legitimate version bump, and fails
// loudly if anything else changed, regardless of where it came from.
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

const ALLOWED_PATHS = new Set(["README.md", "package.json", "package-lock.json"]);

const changedFiles = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" })
	.split("\n")
	.filter(Boolean);

if (changedFiles.length === 0) {
	console.log("No changes to validate.");
	process.exit(0);
}

for (const file of changedFiles) {
	if (!ALLOWED_PATHS.has(file)) {
		fail(`unexpected file changed: ${file} (only ${[...ALLOWED_PATHS].join(", ")} are expected)`);
	}
}

// README.md: exactly the one compatibility sentence update-versions.mjs
// writes, byte-identical everywhere else.
if (changedFiles.includes("README.md")) {
	const before = gitShowHead("README.md");
	const after = readFileSync("README.md", "utf8");
	const semver = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;
	const regex = new RegExp(
		`This was developed for version (${semver}) of n8n and version (${semver}) of Actual\\.`,
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
// depth, fails.
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
		if (typeof after.n8nWorkflowVersion !== "string") {
			fail("package.json: n8nWorkflowVersion did not change to a string");
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
	}
}

// package-lock.json: can legitimately touch many lines (npm's own
// transitive resolution), so this can't be validated line-by-line the same
// way — but it must still be valid JSON describing the same root package,
// which catches gross tampering (e.g. a script overwriting it outright).
if (changedFiles.includes("package-lock.json")) {
	const before = JSON.parse(gitShowHead("package-lock.json"));
	const after = JSON.parse(readFileSync("package-lock.json", "utf8"));
	if (before.name !== after.name) {
		fail(`package-lock.json: root package name changed (${before.name} -> ${after.name})`);
	}
}

console.log(`OK: diff matches the expected shape of a version bump (${changedFiles.join(", ")}).`);
