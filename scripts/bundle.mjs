#!/usr/bin/env node
// Community node packages may not declare native-addon or other shared-library runtime
// dependencies (package.json "dependencies" must be empty) — see
// @n8n/community-nodes/no-runtime-dependencies. @actual-app/api and detect-libc are
// devDependencies instead, and this step bundles their JS directly into dist/ so the
// published package doesn't need them installed at all.
//
// better-sqlite3 (a transitive, native-addon dependency of @actual-app/api) can't be
// bundled as JS. Its pure-JS API wrapper is vendored, unmodified, in third_party/ and
// bundled in here too; the one native-loading call it makes (`require('bindings')(...)`)
// is aliased to scripts/bindingsAdapter.cjs, which loads this package's own vendored
// prebuilt binary directly (see nodes/ActualBudget/bindingsShim.ts).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cp } from 'node:fs/promises';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..');
const outDir = join(repoRoot, 'dist', 'nodes', 'ActualBudget');

await build({
	entryPoints: [join(outDir, 'ActualBudget.node.js')],
	outfile: join(outDir, 'ActualBudget.node.js'),
	allowOverwrite: true,
	bundle: true,
	platform: 'node',
	target: 'node20',
	format: 'cjs',
	logLevel: 'info',
	// n8n-workflow is a peerDependency, resolved by the host n8n installation at runtime.
	external: ['n8n-workflow'],
	alias: {
		'better-sqlite3': join(repoRoot, 'third_party', 'better-sqlite3', 'lib', 'index.js'),
		bindings: join(repoRoot, 'scripts', 'bindingsAdapter.cjs'),
	},
});

// @actual-app/core resolves its migration scripts and template database relative to its
// own __dirname at runtime (`path.join(__dirname, 'migrations' | 'default-db.sqlite')`).
// Bundling moves that code's __dirname to this output directory, so these data files
// (not JS, nothing for esbuild to inline) have to be copied alongside it to match.
const coreDir = join(repoRoot, 'node_modules', '@actual-app', 'core');
await cp(join(coreDir, 'migrations'), join(outDir, 'migrations'), { recursive: true });
await cp(join(coreDir, 'default-db.sqlite'), join(outDir, 'default-db.sqlite'));
