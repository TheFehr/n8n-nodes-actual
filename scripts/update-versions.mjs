import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

async function getLatestNpmVersion(pkg) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`;
  const headers = { Accept: "application/json" };
  if (process.env.NPM_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.NPM_TOKEN}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch ${pkg} from npm: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.version;
}

async function updatePackageJson(n8nWorkflowVersion, actualVersion, dryRun) {
  const path = join(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));

  const newN8nPeer = `^${n8nWorkflowVersion}`;
  const newActual = actualVersion;
  const oldN8nPeer = pkg.peerDependencies?.["n8n-workflow"];
  const oldActual = pkg.devDependencies?.["@actual-app/api"];

  let updated = false;

  if (oldN8nPeer !== newN8nPeer) {
    console.log(`package.json: peerDependencies.n8n-workflow (${oldN8nPeer} -> ${newN8nPeer})`);
    if (!dryRun) pkg.peerDependencies["n8n-workflow"] = newN8nPeer;
    updated = true;
  }

  if (oldActual !== newActual) {
    console.log(`package.json: devDependencies.@actual-app/api (${oldActual} -> ${newActual})`);
    if (!dryRun) pkg.devDependencies["@actual-app/api"] = newActual;
    updated = true;
  }

  if (updated && !dryRun) {
    writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  }

  return updated;
}

async function updateReadme(n8nVersion, actualVersion, dryRun) {
  const path = join(process.cwd(), "README.md");
  let content = readFileSync(path, "utf8");

  const semver = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;
  const regex = new RegExp(
    `This was developed for version (${semver}) of n8n and version (${semver}) of Actual\\.`,
  );
  const replacement = `This was developed for version ${n8nVersion} of n8n and version ${actualVersion} of Actual.`;
  const match = content.match(regex);

  if (!match) {
    throw new Error(`Could not find compatibility sentence in README.md matching: ${regex.source}`);
  }

  if (match[0] === replacement) return false;

  console.log(`README.md: compatibility (${match[0]} -> ${replacement})`);
  if (!dryRun) writeFileSync(path, content.replace(regex, replacement));
  return true;
}

async function main() {
  try {
    const dryRun = process.argv.includes("--check");

    const n8nVersion = await getLatestNpmVersion("n8n");
    const n8nWorkflowVersion = await getLatestNpmVersion("n8n-workflow");
    const actualVersion = await getLatestNpmVersion("@actual-app/api");

    console.log(`Latest n8n:            ${n8nVersion}`);
    console.log(`Latest n8n-workflow:   ${n8nWorkflowVersion}`);
    console.log(`Latest @actual-app/api: ${actualVersion}`);

    const pkgUpdated = await updatePackageJson(n8nWorkflowVersion, actualVersion, dryRun);
    const readmeUpdated = await updateReadme(n8nVersion, actualVersion, dryRun);

    const anyUpdated = pkgUpdated || readmeUpdated;

    if (anyUpdated) {
      if (dryRun) {
        console.log("\nUpdates available. Run 'npm run version:update' to apply.");
        process.exit(2); // 2 = updates found; 1 = reserved for genuine errors
      } else {
        console.log("\nFiles updated successfully.");
      }
    } else {
      console.log("\nEverything is up to date.");
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
