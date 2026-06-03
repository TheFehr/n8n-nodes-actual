/**
 * Creates (or reuses) an E2E test budget, account, and expense category on the Actual Budget server.
 * Outputs {"budgetId":"...","accountId":"...","categoryId":"..."} to stdout.
 */
import * as api from "@actual-app/api";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const serverURL = process.env.ACTUAL_TEST_URL || "http://localhost:5006";
const password = process.env.ACTUAL_TEST_PASS || "test-password";
const dataDir = mkdtempSync(join(tmpdir(), "actual-setup-"));

await api.init({ serverURL, password, dataDir });

let budgets = await api.getBudgets();

if (budgets.length === 0) {
  // Create a fresh budget and upload it to the server
  await api.runImport("E2E Test Budget", async () => {
    await api.createAccount({ name: "E2E Test Checking", type: "checking", offbudget: false }, 0);
  });
  // Re-fetch so we get the server format with groupId
  budgets = await api.getBudgets();
}

const budget = budgets[0];
const budgetId = budget.groupId;
if (!budgetId) {
  throw new Error(
    `Budget has no groupId — got: ${JSON.stringify(budget)}. Cannot continue.`,
  );
}

await api.downloadBudget(budgetId);

let accounts = await api.getAccounts();
if (accounts.length === 0) {
  await api.createAccount({ name: "E2E Test Checking", type: "checking", offbudget: false }, 0);
  accounts = await api.getAccounts();
}

const accountId = accounts[0].id;

// Find or create a dedicated E2E test expense category (never reuse an arbitrary existing one)
const allCategories = await api.getCategories();
const existingCategory = allCategories.find((c) => c.name === "E2E Test Expenses" && c.group_id && !c.is_income);
let categoryId;
if (existingCategory) {
  categoryId = existingCategory.id;
} else {
  const allGroups = await api.getCategoryGroups();
  const existingGroup = allGroups.find((g) => g.name === "E2E Test");
  const groupId = existingGroup
    ? existingGroup.id
    : await api.createCategoryGroup({ name: "E2E Test", is_income: false, hidden: false });
  categoryId = await api.createCategory({ name: "E2E Test Expenses", group_id: groupId, is_income: false, hidden: false });
}

await api.shutdown();

// Write JSON on its own line so callers can reliably extract it with `tail -1`
process.stdout.write(JSON.stringify({ budgetId, accountId, categoryId }) + "\n");
