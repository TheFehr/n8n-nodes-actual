import { join } from 'path';
import { familySync, GLIBC, MUSL } from 'detect-libc';

// Community node packages can't declare native-addon runtime dependencies (see
// no-runtime-dependencies lint rule), so better-sqlite3 can't be an npm dependency here.
// Its pure-JS API layer is vendored into third_party/better-sqlite3 and bundled directly
// into dist/ (see scripts/bundle.mjs), which aliases the "bindings" package (the one
// native-loading call that vendored code makes) to this file instead of the real thing.
//
// This replaces having to guess where the real `bindings` package would search and copy
// a prebuilt binary there (the previous approach, see git history for ensureNativeBinding):
// we know exactly which binary we vendored and load it directly.
//
export type NativeRequire = (path: string) => unknown;

// The vendored better-sqlite3 code calls the require() result directly as
// `require('bindings')('better_sqlite3.node')`, so scripts/bundle.mjs aliases "bindings"
// to a tiny hand-written adapter (scripts/bindingsAdapter.cjs) whose module.exports IS
// this function, not this file directly — a normal `export default` here would leave
// the function nested under `.default`, which a plain `require('bindings')(...)` call
// can't see. The `name` argument is ignored since this shim only ever has one binary to
// load. `nativeRequire` defaults to Node's own `require` and is only overridable so
// tests can assert which path gets loaded without depending on a real, platform-matching
// native addon.
export default function bindings(_name?: string, nativeRequire: NativeRequire = require): unknown {
	if (process.platform !== 'linux' || process.arch !== 'x64') {
		throw new Error(
			`No prebuilt better-sqlite3 binding is vendored for platform "${process.platform}" (arch "${process.arch}")`,
		);
	}

	const libc = familySync();
	const variant = libc === MUSL ? 'linux-x64-musl' : libc === GLIBC ? 'linux-x64-glibc' : undefined;
	if (!variant) {
		throw new Error('Could not detect libc family (glibc/musl) to select a better-sqlite3 binding');
	}

	// Compiled+bundled layout is dist/nodes/ActualBudget/ActualBudget.node.js; the vendor
	// directory ships alongside dist at the package root (see package.json "files").
	return nativeRequire(join(__dirname, '..', '..', '..', 'vendor', 'better-sqlite3', variant, 'better_sqlite3.node'));
}
