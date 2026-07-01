import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { familySync, GLIBC, MUSL } from 'detect-libc';

export type ModuleResolver = (request: string, options?: { paths?: string[] }) => string;

// n8n's Community Nodes installer runs `npm install --ignore-scripts=true`, so
// better-sqlite3's own install script (which fetches/builds its native binary) never
// runs. Without it, better-sqlite3 has no compiled better_sqlite3.node anywhere and
// throws "Could not locate the bindings file" the first time a budget is loaded.
//
// We vendor prebuilt binaries for the platforms n8n commonly runs on and place them
// wherever the `bindings` package (used by better-sqlite3) will look, before any
// Actual API call that would trigger loading the native module. This is plain runtime
// code, not an install script, so --ignore-scripts has no effect on it.
//
// `resolve` defaults to Node's own require.resolve and is only overridable so tests can
// exercise the target-path logic without depending on the real node_modules layout.
export function ensureNativeBinding(resolve: ModuleResolver = require.resolve): void {
	const vendored = resolveVendoredBinding();
	if (!vendored) return;

	for (const target of resolveTargetPaths(resolve)) {
		try {
			if (existsSync(target)) continue;
			mkdirSync(dirname(target), { recursive: true });
			copyFileSync(vendored, target);
		} catch {
			// Best-effort: if we can't place it, the original "could not locate bindings"
			// error still surfaces exactly as before, so this can't make things worse.
		}
	}
}

function resolveVendoredBinding(): string | undefined {
	if (process.platform !== 'linux' || process.arch !== 'x64') return undefined;

	const libc = familySync();
	const variant = libc === MUSL ? 'linux-x64-musl' : libc === GLIBC ? 'linux-x64-glibc' : undefined;
	if (!variant) return undefined;

	// Compiled layout is dist/nodes/ActualBudget/ensureNativeBinding.js; the vendor
	// directory ships alongside dist at the package root (see package.json "files").
	const candidate = join(__dirname, '..', '..', '..', 'vendor', 'better-sqlite3', variant, 'better_sqlite3.node');
	return existsSync(candidate) ? candidate : undefined;
}

function resolveTargetPaths(resolve: ModuleResolver): string[] {
	const targets: string[] = [];

	// Observed in production: n8n's shallow, hoisted community-node install leads the
	// `bindings` package to resolve its search root to this package's own directory
	// rather than better-sqlite3's, so it looks for build/Release/better_sqlite3.node here.
	targets.push(join(__dirname, '..', '..', '..', 'build', 'Release', 'better_sqlite3.node'));

	// Also cover the conventional location: better-sqlite3's own package directory.
	// better-sqlite3 is only a transitive dependency of @actual-app/api, and npm may nest
	// it under @actual-app/api's own node_modules rather than hoisting it next to this
	// package, so resolve it starting from @actual-app/api's directory rather than ours —
	// a plain require.resolve('better-sqlite3/...') from this file would miss that nesting.
	try {
		// @actual-app/api's package.json restricts "exports" to its main entry, so resolve
		// that (not "@actual-app/api/package.json") to get a directory inside its tree.
		const actualApiEntryDir = dirname(resolve('@actual-app/api'));
		const betterSqlite3Dir = dirname(
			resolve('better-sqlite3/package.json', { paths: [actualApiEntryDir] }),
		);
		targets.push(join(betterSqlite3Dir, 'build', 'Release', 'better_sqlite3.node'));
	} catch {
		// Neither package resolvable from here; nothing more we can do.
	}

	return targets;
}
