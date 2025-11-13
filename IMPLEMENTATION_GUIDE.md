# Implementation Guide: n8n-nodes-actual Expansion

This guide breaks down the `plan.md` into a trackable checklist of development tasks.

## AI Development Workflow

To ensure a structured and validated development process, the AI should adhere to the following workflow:

1.  **One Task at a Time:** Implement only one task from the checklist at a time.
2.  **Seek Permission:** After completing a task, await explicit permission from the user before proceeding to the next task.
3.  **Validate Changes:** The user will review and validate the changes for each completed task before granting permission to move forward.

## Phase I: Project Configuration and Setup

- [ ] **Task 1: Finalize `package.json`**
    - [ ] Add `@actual-app/api` to `dependencies`.
    - [ ] Verify `n8n.n8nNodesApiVersion` is set correctly.
    - [ ] Update `n8n.credentials` path to `dist/credentials/ActualBudgetApi.credentials.js`.
    - [ ] Update `n8n.nodes` path to `dist/nodes/ActualBudget/ActualBudget.node.js`.
    - [ ] Add `n8n-community-node-package` to `keywords`.
    - [ ] Update `repository.url` and `author` details.

## Phase II: Credential and API Client Implementation

- [ ] **Task 2: Refine Credential Definition**
    - [ ] Update `credentials/ActualBudgetApi.credentials.ts`.
    - [ ] Add `serverURL` property.
    - [ ] Add `password` property.
    - [ ] Remove any hardcoded or user-facing `dataDir` property.

- [ ] **Task 3: Implement API Client Initialization**
    - [ ] In `nodes/ActualBudget/ActualBudget.node.ts`, create the `initApiClient` private helper function.
    - [ ] Implement logic to fetch credentials.
    - [ ] Implement logic to generate a persistent, credential-specific `dataDir` using a hash of the `serverURL`.
    - [ ] Ensure the `dataDir` is created on the filesystem.
    - [ ] Call `api.init()` with the correct parameters.
    - [ ] Implement robust error handling for initialization failures.

## Phase III: Core Node Structure and UI

- [ ] **Task 4: Refactor `ActualBudget.node.ts` to Programmatic Style**
    - [ ] Define the main `Actual` class implementing `INodeType`.
    - [ ] Configure the `description` property with `displayName`, `name`, `icon`, `group`, `version`, `subtitle`, etc.
    - [ ] Add the `actualApi` credential to the `credentials` array.

- [ ] **Task 5: Define Resources and Operations**
    - [ ] Add the `resource` dropdown property.
    - [ ] Add conditional `operation` dropdown properties for each resource (`account`, `budget`, `category`, `categoryGroup`, `payee`, `rule`, `schedule`, `transaction`, `utility`).

- [ ] **Task 6: Implement UI Input Fields**
    - [ ] **Account Fields:** Implement all input properties for `account` operations.
    - [ ] **Budget Fields:** Implement all input properties for `budget` operations.
    - [ ] **Category Fields:** Implement all input properties for `category` and `categoryGroup` operations.
    - [ ] **Payee Fields:** Implement all input properties for `payee` operations.
    - [ ] **Rule & Schedule Fields:** Implement all input properties for `rule` and `schedule` operations.
    - [ ] **Transaction Fields:** Implement all input properties for `transaction` operations.
    - [ ] **Utility Fields:** Implement all input properties for `utility` operations.

- [ ] **Task 7: Implement Dynamic Dropdowns (`loadOptions`)**
    - [ ] Create the `methods` block within the `Actual` class.
    - [ ] Implement `methods.loadOptions.getAccounts`.
    - [ ] Implement `methods.loadOptions.getCategories`.
    - [ ] Implement `methods.loadOptions.getCategoryGroups`.
    - [ ] Implement `methods.loadOptions.getPayees`.
    - [ ] Implement `methods.loadOptions.getRules`.
    - [ ] Implement `methods.loadOptions.getSchedules`.
    - [ ] Ensure all `loadOptions` methods use `initApiClient` and have proper `try...catch...finally` blocks to prevent UI crashes and connection leaks.

## Phase IV: Execution Logic

- [ ] **Task 8: Implement the `execute` Method**
    - [ ] Add the `execute` method to the `Actual` class.
    - [ ] Call `initApiClient` once at the start of the execution.
    - [ ] Use a `finally` block to guarantee `api.shutdown()` is called.
    - [ ] Implement the main `switch (resource)` statement.
    - [ ] Implement nested `switch (operation)` statements for each resource.

- [ ] **Task 9: Implement All API Operations**
    - [ ] **Account:** `getAccounts`, `createAccount`, `getAccountBalance`, `updateAccount`, `closeAccount`, `reopenAccount`, `deleteAccount`.
    - [ ] **Budget:** `getBudgetMonths`, `getBudgetMonth`, `setBudgetAmount`, `setBudgetCarryover`, `holdBudgetForNextMonth`, `resetBudgetHold`, `loadBudget`, `downloadBudget`, `batchBudgetUpdates`.
    - [ ] **Category:** `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`.
    - [ ] **Category Group:** `getCategoryGroups`, `createCategoryGroup`, `updateCategoryGroup`, `deleteCategoryGroup`.
    - [ ] **Payee:** `getPayees`, `createPayee`, `updatePayee`, `deletePayee`, `mergePayees`, `getPayeeRules`.
    - [ ] **Rule:** `getRules`, `createRule`, `updateRule`, `deleteRule`.
    - [ ] **Schedule:** `getSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule`.
    - [ ] **Transaction:** `getTransactions`, `addTransactions`, `importTransactions`, `updateTransaction`, `deleteTransaction`.
    - [ ] **Utility:** `sync`, `runBankSync`, `runQuery`, `getIDByName`.
    - [ ] Ensure all operations correctly retrieve parameters using `this.getNodeParameter()`.
    - [ ] Ensure all operations format and return data using `this.helpers.returnJsonArray()`.

## Phase V: Testing and Validation

- [ ] **Task 10: Manual Testing**
    - [ ] Perform credential tests (valid and invalid).
    - [ ] Perform `loadOptions` UI tests for all dynamic dropdowns.
    - [ ] Test all "Read" (GET) operations.
    - [ ] Test all "Write" (CREATE) operations.
    - [ ] Test all "Update" (UPDATE) operations.
    - [ ] Test all "Delete" (DELETE) operations.
    - [ ] Test error handling for missing parameters and invalid credentials.