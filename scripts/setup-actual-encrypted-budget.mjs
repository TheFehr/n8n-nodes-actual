/**
 * Creates an END-TO-END ENCRYPTED test budget (with one account) on the Actual Budget server,
 * alongside the unencrypted one created by setup-actual-budget.mjs.
 * Outputs {"budgetId":"...","accountId":"..."} to stdout (last line).
 */
import * as api from "@actual-app/api";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const serverURL = process.env.ACTUAL_TEST_URL || "http://localhost:5006";
const password = process.env.ACTUAL_TEST_PASS || "test-password";
const encryptionPassword = process.env.ACTUAL_TEST_E2E_PASS || "test-e2e-password";
const budgetName = "E2E Encrypted Test Budget";
const dataDir = mkdtempSync(join(tmpdir(), "actual-setup-enc-"));

const ctx = await api.init({ serverURL, password, dataDir });

let existing = (await api.getBudgets()).find((b) => b.name === budgetName);
if (!existing) {
  await api.runImport(budgetName, async () => {
    await api.createAccount(
      { name: "E2E Encrypted Checking", type: "checking", offbudget: false },
      0,
    );
  });
  // The imported budget is now loaded and uploaded. Turn on E2E encryption for it, which
  // re-uploads the file encrypted with a key derived from the password.
  const res = await ctx.send("key-make", { password: encryptionPassword });
  if (res && res.error) {
    throw new Error(`key-make failed: ${JSON.stringify(res.error)}`);
  }
  existing = (await api.getBudgets()).find((b) => b.name === budgetName);
}

const budgetId = existing?.groupId;
if (!budgetId) {
  throw new Error(`Encrypted budget has no groupId — got: ${JSON.stringify(existing)}`);
}

const accounts = await api.getAccounts();
const accountId = accounts[0].id;
await api.shutdown();

process.stdout.write(JSON.stringify({ budgetId, accountId }) + "\n");
