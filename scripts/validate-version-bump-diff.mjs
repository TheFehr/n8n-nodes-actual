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

// Mirrors update-versions.mjs's own registry lookup — duplicated rather than
// imported, so this validator has no runtime dependency on that script's
// behavior and keeps working even if that script changes. Used below to
// confirm a changed version value is the one the npm registry actually
// published, not just any syntactically-valid semver string a compromised
// prepare-job lifecycle script could have substituted.
async function getLatestNpmVersion(pkg) {
	const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`;
	const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
	if (!res.ok) fail(`could not fetch ${pkg}'s latest version from npm to authorize the diff: ${res.status} ${res.statusText}`);
	const data = await res.json();
	return data.version;
}

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;
const SEMVER_RE = new RegExp(`^${SEMVER}$`);

const ALLOWED_PATHS = new Set(["README.md", "package.json"]);

const changedFiles = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" })
	.split("\n")
	.filter(Boolean);

// This validator only ever runs in nightly-version-bump.yml's commit job,
// itself gated on prepare's own updates_found=true — so reaching this point
// with an empty diff is not "nothing to do," it's an anomaly. A compromised
// lifecycle script in prepare's npm ci/npm install could run after
// version:update legitimately rewrote the files and restore them back to
// their original HEAD content, making the uploaded artifact indistinguishable
// from no change at all — silently suppressing the compatibility-update PR
// with no error and no signal. Fail loudly instead of treating that as clean.
if (changedFiles.length === 0) {
	fail("no changes found, but this job only runs when prepare reported updates_found=true — a lifecycle script may have suppressed the legitimate version bump");
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
	// The stripped-diff check above only proves the rest of the file is
	// untouched and the sentence still has the right shape — it strips the
	// whole sentence before comparing, so any semver pair would pass. Confirm
	// the captured values are themselves the registry's current latest, same
	// as the package.json checks below.
	const [, afterN8n, afterActual] = after.match(regex);
	const expectedN8n = await getLatestNpmVersion("n8n");
	if (afterN8n !== expectedN8n) {
		fail(`README.md: compatibility sentence's n8n version (${afterN8n}) does not match n8n's current published latest (${expectedN8n}) on npm`);
	}
	const expectedActualForReadme = await getLatestNpmVersion("@actual-app/api");
	if (afterActual !== expectedActualForReadme) {
		fail(`README.md: compatibility sentence's Actual version (${afterActual}) does not match @actual-app/api's current published latest (${expectedActualForReadme}) on npm`);
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
		// Syntax alone isn't authentication: a compromised prepare-job
		// lifecycle script could substitute any other real, published semver
		// here and pass the check above. Confirm it's the exact value the
		// registry currently publishes as latest.
		const expectedWorkflowVersion = await getLatestNpmVersion("n8n-workflow");
		if (after.n8nWorkflowVersion !== expectedWorkflowVersion) {
			fail(`package.json: n8nWorkflowVersion (${after.n8nWorkflowVersion}) does not match n8n-workflow's current published latest (${expectedWorkflowVersion}) on npm`);
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
		const expectedApiVersion = await getLatestNpmVersion("@actual-app/api");
		if (afterDeps[key] !== expectedApiVersion) {
			fail(`package.json: devDependencies["@actual-app/api"] (${afterDeps[key]}) does not match @actual-app/api's current published latest (${expectedApiVersion}) on npm`);
		}
	}
}

// package.json's devDependencies["@actual-app/api"] and README.md's
// compatibility sentence's "Actual" version are both written from the exact
// same actualVersion value inside update-versions.mjs, in the same run —
// unlike n8nWorkflowVersion (package.json) and the "n8n" version (README),
// which come from two independent npm packages ("n8n-workflow" and "n8n")
// and can legitimately move on their own. So, unlike those, these two are
// never allowed to disagree, regardless of which file(s) happen to appear
// in changedFiles: a compromised script could let package.json's update go
// through untouched while specifically suppressing README's matching
// update (or vice versa), producing a diff that looks like a valid
// single-target update but is actually a partial, inconsistent one.
const finalPkg = JSON.parse(readFileSync("package.json", "utf8"));
const finalPkgApiVersion = finalPkg.devDependencies?.["@actual-app/api"];
const finalReadme = readFileSync("README.md", "utf8");
const finalReadmeRegex = new RegExp(
	`This was developed for version (?:${SEMVER}) of n8n and version (${SEMVER}) of Actual\\.`,
);
const finalReadmeMatch = finalReadme.match(finalReadmeRegex);
if (!finalReadmeMatch) {
	fail("README.md's compatibility sentence is missing");
}
const finalReadmeApiVersion = finalReadmeMatch[1];
if (finalPkgApiVersion !== finalReadmeApiVersion) {
	fail(
		`package.json's devDependencies["@actual-app/api"] (${finalPkgApiVersion}) and README.md's compatibility sentence's Actual version (${finalReadmeApiVersion}) disagree — both come from the same @actual-app/api registry lookup in the same run, so a mismatch means one file's update was suppressed`,
	);
}

console.log(`OK: diff matches the expected shape of a version bump (${changedFiles.join(", ")}).`);
