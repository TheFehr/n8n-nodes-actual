# GEMINI.md

## Project Overview

This project is a community-built n8n node for [Actual Budget](https://actualbudget.org/), a local-first, open-source personal finance tool. It allows users to interact with their Actual Budget instance from within their n8n workflows. The node is written in TypeScript and uses the `@actual-app/api` library to communicate with the Actual Budget server.

### Key Technologies

*   **n8n:** A fair-code licensed workflow automation platform. For more details, refer to the [n8n community nodes documentation](https://docs.n8n.io/integrations/).
*   **TypeScript:** The programming language used to build the node.
*   **Node.js:** The runtime environment for the node.
*   **@actual-app/api:** The official API library for Actual Budget. For more details, refer to the [Actual Budget API Documentation](https://actualbudget.org/docs/api/).

### Architecture

The project is structured as a standard n8n community node, with the following key components:

*   **`credentials/ActualBudgetApi.credentials.ts`:** Defines the credentials required to connect to the Actual Budget API (URL and password).
*   **`nodes/ActualBudget/ActualBudget.node.ts`:** Contains the main logic for the node, including the definition of the node's properties, operations, and the `execute` method that runs the node's functionality.

## Building and Running

### Prerequisites

*   [Node.js](https://nodejs.org/) (version specified in `package.json`)
*   [npm](https://www.npmjs.com/)

### Installation

1.  Clone the repository.
2.  Install the dependencies:

    ```bash
    npm install
    ```

### Build

To build the node, run the following command:

```bash
npm run build
```

This will compile the TypeScript code to JavaScript and copy the necessary files to the `dist` directory.

### Development

To run the node in development mode with automatic recompilation on file changes, use the following command:

```bash
npm run dev
```

## Development Conventions

### Linting and Formatting

This project uses ESLint for linting and Prettier for code formatting.

*   **To run the linter:**

    ```bash
    npm run lint
    ```

*   **To automatically fix linting errors:**

    ```bash
    npm run lintfix
    ```

*   **To format the code:**

    ```bash
    npm run format
    ```

### Testing

There are no explicit tests in this project. However, the `ActualBudgetApi.credentials.ts` file includes a `test` property that defines a request to be sent to the Actual Budget server to verify the credentials.
