# n8n-nodes-actual

This is a n8n community node. It lets you use Actual in your n8n workflows.

Actual is a local-first personal finance tool. It is 100% free and open-source, written in NodeJS, it has a synchronization element so that all your changes can move between devices without any heavy lifting.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)
[Compatibility](#compatibility)  
[Resources](#resources)  
[License](#license)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

- **Get Budget Month** — retrieve budget data (income, spending, balances per category) for a given month
- **Get Transactions** — fetch transactions from an account within a date range
- **Import Transactions** — import a list of transactions into an account
- **Set Budget Amount** — set the budgeted amount for a category in a given month


## Credentials
The URL and the password of your actual server.
E2E budgets are currently **not** supported.


## Compatibility

<!-- n8n-node-tooling:compatibility -->
Last tested with n8n 2.46.6 and Actual 26.11.0.
<!-- /n8n-node-tooling:compatibility -->

## Versioning

The package version mirrors the Actual it was last tested with: `major.minor` is Actual's, so `26.10.x` goes with Actual `26.10`. The patch number is this package's own counter.

- Every change to the node, **including breaking ones**, only bumps the patch. Breaking changes are called out in the release notes, not in the version number. Read the notes before updating.
- When Actual's major or minor version changes, the next release is `<major>.<minor>.0`, after the nightly compatibility check has passed against the new Actual.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [Actual Budget Website](https://actualbudget.org/)

## License

MIT, see [LICENSE.md](LICENSE.md).

Community node packages can't declare native-addon or shared-library runtime
dependencies, so a few third-party packages (`@actual-app/api`, `better-sqlite3`,
`detect-libc`, and their own dependencies) are bundled directly into this package's
build output rather than installed normally — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for their license terms.

