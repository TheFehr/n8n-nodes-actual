# Third-Party Notices

This package is MIT licensed (see `LICENSE.md`). Community node packages may not declare
native-addon or other shared-library runtime dependencies, so instead of being installed
normally via npm, the packages below are bundled directly into `dist/nodes/ActualBudget/ActualBudget.node.js`
at build time (see `scripts/bundle.mjs`). Their license terms travel with that bundled
code rather than via `node_modules`, so they're reproduced here.

## better-sqlite3 (MIT)

Copyright (c) 2017 Joshua Wise and other contributors.

Its pure-JS API layer is vendored verbatim, unmodified, in `third_party/better-sqlite3/`
(see `third_party/better-sqlite3/LICENSE` and `NOTICE.md` for details) and bundled from
there. The native addon itself is not bundled — this package instead ships prebuilt
binaries in `vendor/better-sqlite3/`.

Source: https://github.com/WiseLibs/better-sqlite3

## detect-libc (Apache-2.0)

Copyright (c) Lovell Fuller and contributors.

Bundled unmodified from the published npm package. Full license text:
`third_party/detect-libc/LICENSE`.

Source: https://github.com/lovell/detect-libc

## @actual-app/api (MIT), @actual-app/core (ISC), @actual-app/crdt (MIT)

Copyright (c) the Actual Budget contributors.

@actual-app/api ships its own dependencies (@actual-app/core, @actual-app/crdt, uuid,
compare-versions) pre-bundled into its own published `dist/index.js`; that whole bundle
is inlined here in turn. Only `better-sqlite3` is required separately by
@actual-app/api at that point (handled as described above).

Source: https://github.com/actualbudget/actual (packages/api, packages/loot-core,
packages/crdt)

## uuid (MIT), compare-versions (MIT)

Bundled transitively as part of @actual-app/api's own published bundle (see above).

- uuid: https://github.com/uuidjs/uuid
- compare-versions: https://github.com/omichelsen/compare-versions
