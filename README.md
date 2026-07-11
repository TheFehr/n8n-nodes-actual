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

This was developed for version 2.29.10 of n8n and version 26.7.0 of Actual.

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

