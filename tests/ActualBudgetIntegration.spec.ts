import { describe, it, expect, afterAll } from "vitest";
import { ActualBudget } from "../nodes/ActualBudget/ActualBudget.node";
import type { IDataObject, IExecuteFunctions } from "n8n-workflow";
import * as api from "@actual-app/api";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const runIntegration = process.env.RUN_ACTUAL_INTEGRATION === "true";

describe.skipIf(!runIntegration)("ActualBudget Integration", () => {
  const serverURL = process.env.ACTUAL_TEST_URL || "http://localhost:5006";
  const password = process.env.ACTUAL_TEST_PASS || "test-password";
  const budgetId = process.env.ACTUAL_TEST_BUDGET_ID!;
  const accountId = process.env.ACTUAL_TEST_ACCOUNT_ID!;

  const dataDir = mkdtempSync(join(tmpdir(), "actual-integration-"));

  afterAll(async () => {
    // No need to delete transactions — the docker volume is wiped on teardown.
    await api.shutdown().catch(() => {});
  });

  it("should import transactions via the node", async () => {
    const transactions = [
      { date: "2024-03-01", amount: -2500, notes: "Integration test transaction" },
    ];

    const node = new ActualBudget();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "importTransactions";
        if (name === "budgetId") return budgetId;
        if (name === "accountId") return accountId;
        if (name === "transactions") return transactions;
        return undefined;
      },
      getCredentials: async () => ({ url: serverURL, password }),
      continueOnFail: () => false,
      helpers: {
        returnJsonArray: (data: unknown) =>
          Array.isArray(data)
            ? data.map((d) => ({ json: d as IDataObject }))
            : [{ json: data as IDataObject }],
        constructExecutionMetaData: (data: unknown) => data,
      },
    } as unknown as IExecuteFunctions;

    const result = await node.execute.call(executeFunctions);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);

    const output = result[0][0].json as Record<string, unknown>;
    expect((output.errors as unknown[]).length).toBe(0);
    expect((output.added as unknown[]).length).toBeGreaterThan(0);
  }, 30000);

  it("should reflect imported transactions in the budget", async () => {
    // The node calls shutdown() at the end of execute(), so re-open before verifying
    await api.init({ serverURL, password, dataDir });
    await api.downloadBudget(budgetId);
    const txns = await api.getTransactions(accountId, "2024-03-01", "2024-03-31");
    const testTxn = txns.find((t) => t.notes === "Integration test transaction");
    expect(testTxn).toBeDefined();
    expect(testTxn!.amount).toBe(-2500);
  }, 15000);
});
