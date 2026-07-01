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
  const categoryId = process.env.ACTUAL_TEST_CATEGORY_ID!;
  const testMonth = process.env.ACTUAL_TEST_MONTH ?? "2024-01";

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
        if (name === "transactions") return JSON.stringify(transactions);
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

  it("should handle concurrent executions without crashing on the shared session", async () => {
    // Regression test: @actual-app/api keeps its session (DB connection, sync clock) in a
    // module-level singleton. Two node executions running at once in the same process used to
    // let one's shutdown() tear down state the other was still mid-operation on, crashing deep
    // in the SDK's sync internals. Fire two executions concurrently against the real API and
    // confirm both complete cleanly instead of racing.
    const makeExecuteFunctions = (notes: string, amount: number) =>
      ({
        getInputData: () => [{ json: {} }],
        getNodeParameter: (name: string) => {
          if (name === "operation") return "importTransactions";
          if (name === "budgetId") return budgetId;
          if (name === "accountId") return accountId;
          if (name === "transactions")
            return JSON.stringify([{ date: "2024-03-02", amount, notes }]);
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
      }) as unknown as IExecuteFunctions;

    const nodeA = new ActualBudget();
    const nodeB = new ActualBudget();

    const [resultA, resultB] = await Promise.all([
      nodeA.execute.call(makeExecuteFunctions("Concurrent A", -100)),
      nodeB.execute.call(makeExecuteFunctions("Concurrent B", -200)),
    ]);

    const outputA = resultA[0][0].json as Record<string, unknown>;
    const outputB = resultB[0][0].json as Record<string, unknown>;
    expect((outputA.errors as unknown[]).length).toBe(0);
    expect((outputB.errors as unknown[]).length).toBe(0);
    expect((outputA.added as unknown[]).length).toBeGreaterThan(0);
    expect((outputB.added as unknown[]).length).toBeGreaterThan(0);
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

  it("should get budget month data via the node", async () => {
    const node = new ActualBudget();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "getBudgetMonth";
        if (name === "budgetId") return budgetId;
        if (name === "month") return testMonth;
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
    expect(output.month).toBe(testMonth);
    expect(typeof output.toBudget).toBe("number");
    expect(Array.isArray(output.categoryGroups)).toBe(true);
  }, 15000);

  it("should set budget amount via the node and reflect it in the budget", async () => {
    const node = new ActualBudget();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "budgetId") return budgetId;
        if (name === "month") return testMonth;
        if (name === "categoryId") return categoryId;
        if (name === "amount") return 50000;
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

    expect(result[0][0].json).toMatchObject({ success: true, amount: 50000 });

    // Re-init to verify the write persisted
    await api.init({ serverURL, password, dataDir });
    await api.downloadBudget(budgetId);
    const budgetMonth = await api.getBudgetMonth(testMonth);
    const category = budgetMonth.categoryGroups
      .flatMap((g) => (g as Record<string, unknown> & { categories?: Record<string, unknown>[] }).categories ?? [])
      .find((c) => (c as Record<string, unknown>).id === categoryId);
    expect(category).toBeDefined();
    expect((category as Record<string, unknown>).budgeted).toBe(50000);
  }, 30000);

  it("should get transactions via the node", async () => {
    const node = new ActualBudget();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return budgetId;
        if (name === "accountId") return accountId;
        if (name === "startDate") return "2024-03-01";
        if (name === "endDate") return "2024-03-31";
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

    // The "should import transactions via the node" test imported a transaction on 2024-03-01
    expect(result[0].length).toBeGreaterThan(0);
    const txn = result[0].find((item) => (item.json as Record<string, unknown>).notes === "Integration test transaction");
    expect(txn).toBeDefined();
    expect((txn!.json as Record<string, unknown>).amount).toBe(-2500);
  }, 15000);
});
