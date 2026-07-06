Vendored, unmodified copy of the `lib/` JS wrapper from
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3) v12.11.1 (MIT licensed,
see `LICENSE`).

`better-sqlite3` itself can't be listed as an npm dependency of this package (community
node packages may not declare native-addon runtime dependencies), so its pure-JS API
layer is vendored here and bundled directly into `dist/` at build time. The one native
call it makes — `require('bindings')('better_sqlite3.node')` in `lib/database.js` — is
intercepted at bundle time (see `scripts/bundle.mjs`), which aliases `bindings` to
`nodes/ActualBudget/bindingsShim.ts`. That shim loads this package's own prebuilt
binaries from `vendor/better-sqlite3/` instead of relying on the real `bindings` package
or an npm-installed `better-sqlite3` directory.

To upgrade: copy the new version's `lib/` directory here verbatim, update the version
noted above, and re-vendor matching prebuilt binaries in `vendor/better-sqlite3/`.
