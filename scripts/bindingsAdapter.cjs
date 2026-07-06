'use strict';

// scripts/bundle.mjs aliases the "bindings" package to this file instead of
// nodes/ActualBudget/bindingsShim.ts directly: tsc compiles that file's `export default`
// as `exports.default`, but the vendored better-sqlite3 code calls the require() result
// as a bare function (`require('bindings')('better_sqlite3.node')`), so module.exports
// here must BE the function itself.
module.exports = require('../dist/nodes/ActualBudget/bindingsShim.js').default;
