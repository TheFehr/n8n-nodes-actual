/**
 * Verifies that E2E test transactions exist in the Actual Budget.
 * Outputs {"count": N, "txns": [...notes]} to stdout.
 */
import * as api from "@actual-app/api";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const serverURL = process.env.ACTUAL_TEST_URL || "http://localhost:5006";
const password = process.env.ACTUAL_TEST_PASS || "test-password";
const budgetId = process.env.ACTUAL_TEST_BUDGET_ID;
const accountId = process.env.ACTUAL_TEST_ACCOUNT_ID;

if (!budgetId || !accountId) {
  throw new Error("ACTUAL_TEST_BUDGET_ID and ACTUAL_TEST_ACCOUNT_ID are required");
}

const dataDir = mkdtempSync(join(tmpdir(), "actual-verify-"));

await api.init({ serverURL, password, dataDir });
await api.downloadBudget(budgetId);

const txns = await api.getTransactions(accountId, "2024-06-01", "2024-06-30");
const e2eTxns = txns.filter((t) => t.notes && t.notes.startsWith("E2E test"));

await api.shutdown();

// Write JSON on its own line so callers can reliably extract it with `tail -1`
process.stdout.write(JSON.stringify({ count: e2eTxns.length, txns: e2eTxns.map((t) => t.notes) }) + "\n");
