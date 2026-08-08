import { describe, it, expect, afterAll } from "vitest";
import { ActualBudgetV2 } from "../nodes/ActualBudget/v2/ActualBudgetV2.node";
import { NodeApiError } from "n8n-workflow";
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
  const payeeId = process.env.ACTUAL_TEST_PAYEE_ID!;
  const testMonth = process.env.ACTUAL_TEST_MONTH ?? "2024-01";

  // Shared IExecuteFunctions helpers, mirroring what n8n itself supplies at runtime.
  const helpers = {
    returnJsonArray: (data: unknown) =>
      Array.isArray(data)
        ? data.map((d) => ({ json: d as IDataObject }))
        : [{ json: data as IDataObject }],
    constructExecutionMetaData: (data: unknown) => data,
  };

  function makeExecuteFunctions(params: Record<string, unknown>): IExecuteFunctions {
    return {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => params[name],
      getNode: () => ({ name: "ActualBudget" }),
      getCredentials: async () => ({ url: serverURL, password }),
      continueOnFail: () => false,
      helpers,
    } as unknown as IExecuteFunctions;
  }

  async function runNode(params: Record<string, unknown>) {
    const node = new ActualBudgetV2();
    return node.execute.call(makeExecuteFunctions({ budgetId, ...params }));
  }

  const dataDir = mkdtempSync(join(tmpdir(), "actual-integration-"));

  afterAll(async () => {
    // No need to delete transactions — the docker volume is wiped on teardown.
    await api.shutdown().catch(() => {});
  });

  it("should import transactions via the node", async () => {
    const transactions = [
      { date: "2024-03-01", amount: -2500, notes: "Integration test transaction" },
    ];

    const node = new ActualBudgetV2();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "importTransactions";
        if (name === "resource") return "transaction";
        if (name === "budgetId") return budgetId;
        if (name === "accountId") return accountId;
        if (name === "transactions") return JSON.stringify(transactions);
        return undefined;
      },
      getNode: () => ({ name: "ActualBudget" }),
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
          if (name === "resource") return "transaction";
          if (name === "budgetId") return budgetId;
          if (name === "accountId") return accountId;
          if (name === "transactions")
            return JSON.stringify([{ date: "2024-03-02", amount, notes }]);
          return undefined;
        },
        getNode: () => ({ name: "ActualBudget" }),
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

    const nodeA = new ActualBudgetV2();
    const nodeB = new ActualBudgetV2();

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
    const node = new ActualBudgetV2();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "getBudgetMonth";
        if (name === "resource") return "budget";
        if (name === "budgetId") return budgetId;
        if (name === "month") return testMonth;
        return undefined;
      },
      getNode: () => ({ name: "ActualBudget" }),
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
    const node = new ActualBudgetV2();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "resource") return "budget";
        if (name === "budgetId") return budgetId;
        if (name === "month") return testMonth;
        if (name === "categoryId") return categoryId;
        if (name === "amount") return 50000;
        return undefined;
      },
      getNode: () => ({ name: "ActualBudget" }),
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
    const node = new ActualBudgetV2();
    const executeFunctions = {
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "resource") return "transaction";
        if (name === "budgetId") return budgetId;
        if (name === "accountId") return accountId;
        if (name === "startDate") return "2024-03-01";
        if (name === "endDate") return "2024-03-31";
        return undefined;
      },
      getNode: () => ({ name: "ActualBudget" }),
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

  it("should run an AQL query and return unwrapped rows, not the {data, dependencies} envelope", async () => {
    const result = await runNode({
      operation: "runQuery",
      resource: "query",
      table: "transactions",
      filter: JSON.stringify({ notes: "Integration test transaction" }),
      select: '"*"',
      groupBy: "[]",
      orderBy: "[]",
      rowLimit: 0,
      offset: 0,
    });

    expect(result[0].length).toBeGreaterThan(0);
    const row = result[0][0].json as Record<string, unknown>;
    expect(row).not.toHaveProperty("dependencies");
    expect(row.notes).toBe("Integration test transaction");
    expect(row.amount).toBe(-2500);
  }, 15000);

  it("should get budget months including the test month, mapped to {month} objects", async () => {
    const result = await runNode({ operation: "getBudgetMonths", resource: "budget" });

    expect(result[0].length).toBeGreaterThan(0);
    expect(result[0].map((item) => (item.json as Record<string, unknown>).month)).toContain(testMonth);
    expect(Object.keys(result[0][0].json as object)).toEqual(["month"]);
  }, 15000);

  it("should set and persist a budget category's carryover flag", async () => {
    const result = await runNode({
      operation: "setBudgetCarryover",
      resource: "budget",
      month: testMonth,
      categoryId,
      carryover: true,
    });
    expect(result[0][0].json).toMatchObject({ success: true, carryover: true });

    await api.init({ serverURL, password, dataDir });
    await api.downloadBudget(budgetId);
    const budgetMonth = await api.getBudgetMonth(testMonth);
    const category = budgetMonth.categoryGroups
      .flatMap((g) => (g as Record<string, unknown> & { categories?: Record<string, unknown>[] }).categories ?? [])
      .find((c) => (c as Record<string, unknown>).id === categoryId);
    expect((category as Record<string, unknown>).carryover).toBe(true);
  }, 30000);

  it("should hold for next month and return the API's real boolean result (not a hardcoded true)", async () => {
    // holdForNextMonth only returns true when the month has a positive "to budget" surplus
    // (see @actual-app/api's holdForNextMonth: it returns false otherwise) — our fresh E2E
    // test month has no such surplus, so `false` here is the correct, genuine API response.
    // The point of this assertion is that the node forwards the real value instead of
    // hardcoding `success: true` regardless of outcome.
    const holdResult = await runNode({
      operation: "holdBudgetForNextMonth",
      resource: "budget",
      month: testMonth,
      amount: 1000,
    });
    expect((holdResult[0][0].json as Record<string, unknown>).success).toBe(false);

    const resetResult = await runNode({
      operation: "resetBudgetHold",
      resource: "budget",
      month: testMonth,
    });
    expect(resetResult[0][0].json).toMatchObject({ success: true, month: testMonth });
  }, 30000);

  it("should smoke-test the remaining read-only budget operations", async () => {
    const budgets = await runNode({ operation: "getBudgets", resource: "budget" });
    expect(budgets[0].length).toBeGreaterThan(0);

    const prefs = await runNode({ operation: "getPreferences", resource: "budget" });
    expect(prefs[0][0].json).toBeDefined();

    const version = await runNode({ operation: "getServerVersion", resource: "budget" });
    expect(version[0][0].json).toBeDefined();
  }, 30000);

  it("should create, list, update, and delete a rule via the node", async () => {
    const rule = {
      stage: null,
      conditionsOp: "and",
      conditions: [{ field: "payee", op: "is", value: payeeId }],
      actions: [{ field: "notes", op: "set", value: "Set by E2E rule" }],
    };

    const createResult = await runNode({
      operation: "createRule",
      resource: "rule",
      rule: JSON.stringify(rule),
    });
    const createdRule = createResult[0][0].json as Record<string, unknown>;
    expect(createdRule.id).toBeDefined();
    const ruleId = createdRule.id as string;

    const listResult = await runNode({ operation: "getRules", resource: "rule" });
    expect(listResult[0].map((item) => (item.json as Record<string, unknown>).id)).toContain(ruleId);

    const payeeRulesResult = await runNode({
      operation: "getPayeeRules",
      resource: "rule",
      payeeId,
    });
    expect(payeeRulesResult[0].map((item) => (item.json as Record<string, unknown>).id)).toContain(ruleId);

    const updatedRule = { ...rule, stage: "pre" };
    await runNode({
      operation: "updateRule",
      resource: "rule",
      ruleId,
      rule: JSON.stringify(updatedRule),
    });

    const afterUpdateResult = await runNode({ operation: "getRules", resource: "rule" });
    const updatedEntry = afterUpdateResult[0].find(
      (item) => (item.json as Record<string, unknown>).id === ruleId,
    );
    expect((updatedEntry!.json as Record<string, unknown>).stage).toBe("pre");

    await runNode({ operation: "deleteRule", resource: "rule", ruleId });

    const finalListResult = await runNode({ operation: "getRules", resource: "rule" });
    expect(finalListResult[0].map((item) => (item.json as Record<string, unknown>).id)).not.toContain(ruleId);
  }, 30000);

  it("should create, list, update, and delete a schedule via the node", async () => {
    // Actual recommends unique schedule names, and this suite reuses one long-lived budget
    // with no afterAll cleanup for schedules — use a run-specific name and guarantee deletion
    // even if a later assertion fails, so a failed run doesn't leave debris for the next one.
    const scheduleName = `E2E Test Schedule ${Date.now()}`;
    const createResult = await runNode({
      operation: "createSchedule",
      resource: "schedule",
      name: scheduleName,
      accountId,
      payeeId,
      amountOp: "isbetween",
      amountLower: 1000,
      amountUpper: 2000,
      date: JSON.stringify("2030-01-15"),
      posts_transaction: false,
    });
    const scheduleId = (createResult[0][0].json as Record<string, unknown>).id as string;
    expect(scheduleId).toBeDefined();

    try {
      const listResult = await runNode({ operation: "getSchedules", resource: "schedule" });
      expect(listResult[0].map((item) => (item.json as Record<string, unknown>).id)).toContain(scheduleId);

      const updatedName = `${scheduleName} Updated`;
      await runNode({
        operation: "updateSchedule",
        resource: "schedule",
        scheduleId,
        updateFields: { name: updatedName },
        resetNextDate: true,
      });

      const afterUpdateResult = await runNode({ operation: "getSchedules", resource: "schedule" });
      const updatedEntry = afterUpdateResult[0].find(
        (item) => (item.json as Record<string, unknown>).id === scheduleId,
      );
      expect((updatedEntry!.json as Record<string, unknown>).name).toBe(updatedName);
    } finally {
      await runNode({ operation: "deleteSchedule", resource: "schedule", scheduleId });
    }

    const finalListResult = await runNode({ operation: "getSchedules", resource: "schedule" });
    expect(finalListResult[0].map((item) => (item.json as Record<string, unknown>).id)).not.toContain(scheduleId);
  }, 30000);

  it("should create, list, update, and delete a tag via the node", async () => {
    const createResult = await runNode({
      operation: "createTag",
      resource: "tag",
      tag: "#e2e-test-tag",
      color: "#ff0000",
      description: "E2E test tag",
    });
    const tagId = (createResult[0][0].json as Record<string, unknown>).id as string;
    expect(tagId).toBeDefined();

    const listResult = await runNode({ operation: "getTags", resource: "tag" });
    expect(listResult[0].map((item) => (item.json as Record<string, unknown>).id)).toContain(tagId);

    await runNode({
      operation: "updateTag",
      resource: "tag",
      tagId,
      updateFields: { description: "E2E test tag updated" },
    });

    const afterUpdateResult = await runNode({ operation: "getTags", resource: "tag" });
    const updatedEntry = afterUpdateResult[0].find(
      (item) => (item.json as Record<string, unknown>).id === tagId,
    );
    expect((updatedEntry!.json as Record<string, unknown>).description).toBe("E2E test tag updated");

    await runNode({ operation: "deleteTag", resource: "tag", tagId });

    const finalListResult = await runNode({ operation: "getTags", resource: "tag" });
    expect(finalListResult[0].map((item) => (item.json as Record<string, unknown>).id)).not.toContain(tagId);
  }, 30000);

  it("should set, get, and clear a note attached to an entity via the node", async () => {
    const setResult = await runNode({
      operation: "updateNote",
      resource: "note",
      entityId: accountId,
      note: "E2E test note",
    });
    expect(setResult[0][0].json).toMatchObject({ success: true, note: "E2E test note" });

    const getResult = await runNode({ operation: "getNote", resource: "note", entityId: accountId });
    expect((getResult[0][0].json as Record<string, unknown>).note).toBe("E2E test note");

    await runNode({ operation: "updateNote", resource: "note", entityId: accountId, note: "" });

    const clearedResult = await runNode({ operation: "getNote", resource: "note", entityId: accountId });
    const clearedNote = (clearedResult[0][0].json as Record<string, unknown>).note;
    expect(clearedNote === "" || clearedNote === null).toBe(true);
  }, 30000);

  it("should create, read, update, close, reopen, and delete an account via the node", async () => {
    const accountName = `E2E Test Account ${Date.now()}`;
    const createResult = await runNode({
      operation: "createAccount",
      resource: "account",
      name: accountName,
      offbudget: false,
      initialBalance: 10000,
    });
    const newAccountId = (createResult[0][0].json as Record<string, unknown>).id as string;
    expect(newAccountId).toBeDefined();

    try {
      const listResult = await runNode({ operation: "getAccounts", resource: "account" });
      expect(listResult[0].map((item) => (item.json as Record<string, unknown>).id)).toContain(newAccountId);

      const balanceResult = await runNode({
        operation: "getAccountBalance",
        resource: "account",
        accountId: newAccountId,
        cutoff: "",
      });
      expect(typeof (balanceResult[0][0].json as Record<string, unknown>).balance).toBe("number");

      await runNode({
        operation: "updateAccount",
        resource: "account",
        accountId: newAccountId,
        updateFields: { name: `${accountName} Updated` },
      });

      const afterUpdateResult = await runNode({ operation: "getAccounts", resource: "account" });
      const updatedEntry = afterUpdateResult[0].find(
        (item) => (item.json as Record<string, unknown>).id === newAccountId,
      );
      expect((updatedEntry!.json as Record<string, unknown>).name).toBe(`${accountName} Updated`);

      // Actual requires a transfer account when closing an account with a non-zero balance
      // (this one has a $100 initial balance) — real server behavior, discovered by this test.
      await runNode({
        operation: "closeAccount",
        resource: "account",
        accountId: newAccountId,
        transferAccountId: accountId,
        transferCategoryId: "",
      });

      await runNode({ operation: "reopenAccount", resource: "account", accountId: newAccountId });
    } finally {
      await runNode({ operation: "deleteAccount", resource: "account", accountId: newAccountId });
    }

    const finalListResult = await runNode({ operation: "getAccounts", resource: "account" });
    expect(finalListResult[0].map((item) => (item.json as Record<string, unknown>).id)).not.toContain(newAccountId);
  }, 30000);

  it("should create, list, update, and delete a category group via the node", async () => {
    const groupName = `E2E Test Group ${Date.now()}`;
    const createResult = await runNode({
      operation: "createCategoryGroup",
      resource: "categoryGroup",
      name: groupName,
      is_income: false,
      hidden: false,
    });
    const groupId = (createResult[0][0].json as Record<string, unknown>).id as string;
    expect(groupId).toBeDefined();

    try {
      const listResult = await runNode({ operation: "getCategoryGroups", resource: "categoryGroup" });
      expect(listResult[0].map((item) => (item.json as Record<string, unknown>).id)).toContain(groupId);

      await runNode({
        operation: "updateCategoryGroup",
        resource: "categoryGroup",
        categoryGroupId: groupId,
        updateFields: { name: `${groupName} Updated` },
      });

      const afterUpdateResult = await runNode({ operation: "getCategoryGroups", resource: "categoryGroup" });
      const updatedEntry = afterUpdateResult[0].find(
        (item) => (item.json as Record<string, unknown>).id === groupId,
      );
      expect((updatedEntry!.json as Record<string, unknown>).name).toBe(`${groupName} Updated`);
    } finally {
      await runNode({
        operation: "deleteCategoryGroup",
        resource: "categoryGroup",
        categoryGroupId: groupId,
        transferCategoryId: "",
      });
    }

    const finalListResult = await runNode({ operation: "getCategoryGroups", resource: "categoryGroup" });
    expect(finalListResult[0].map((item) => (item.json as Record<string, unknown>).id)).not.toContain(groupId);
  }, 30000);

  it("should create, list, update, and delete a category via the node", async () => {
    // Creates its own throwaway category group, since createCategory requires one.
    const groupCreateResult = await runNode({
      operation: "createCategoryGroup",
      resource: "categoryGroup",
      name: `E2E Test Category Group ${Date.now()}`,
      is_income: false,
      hidden: false,
    });
    const groupId = (groupCreateResult[0][0].json as Record<string, unknown>).id as string;

    try {
      const categoryName = `E2E Test Category ${Date.now()}`;
      const createResult = await runNode({
        operation: "createCategory",
        resource: "category",
        name: categoryName,
        groupId,
        is_income: false,
        hidden: false,
      });
      const newCategoryId = (createResult[0][0].json as Record<string, unknown>).id as string;
      expect(newCategoryId).toBeDefined();

      try {
        const listResult = await runNode({ operation: "getCategories", resource: "category" });
        expect(listResult[0].map((item) => (item.json as Record<string, unknown>).id)).toContain(newCategoryId);

        await runNode({
          operation: "updateCategory",
          resource: "category",
          categoryId: newCategoryId,
          updateFields: { name: `${categoryName} Updated` },
        });

        const afterUpdateResult = await runNode({ operation: "getCategories", resource: "category" });
        const updatedEntry = afterUpdateResult[0].find(
          (item) => (item.json as Record<string, unknown>).id === newCategoryId,
        );
        expect((updatedEntry!.json as Record<string, unknown>).name).toBe(`${categoryName} Updated`);
      } finally {
        await runNode({
          operation: "deleteCategory",
          resource: "category",
          categoryId: newCategoryId,
          transferCategoryId: "",
        });
      }

      const finalListResult = await runNode({ operation: "getCategories", resource: "category" });
      expect(finalListResult[0].map((item) => (item.json as Record<string, unknown>).id)).not.toContain(
        newCategoryId,
      );
    } finally {
      await runNode({
        operation: "deleteCategoryGroup",
        resource: "categoryGroup",
        categoryGroupId: groupId,
        transferCategoryId: "",
      });
    }
  }, 30000);

  it("should create, list, update, and delete a payee via the node", async () => {
    const payeeName = `E2E Test New Payee ${Date.now()}`;
    const createResult = await runNode({
      operation: "createPayee",
      resource: "payee",
      name: payeeName,
    });
    const newPayeeId = (createResult[0][0].json as Record<string, unknown>).id as string;
    expect(newPayeeId).toBeDefined();

    try {
      const listResult = await runNode({ operation: "getPayees", resource: "payee" });
      expect(listResult[0].map((item) => (item.json as Record<string, unknown>).id)).toContain(newPayeeId);

      await runNode({
        operation: "updatePayee",
        resource: "payee",
        payeeId: newPayeeId,
        updateFields: { name: `${payeeName} Updated` },
      });

      const afterUpdateResult = await runNode({ operation: "getPayees", resource: "payee" });
      const updatedEntry = afterUpdateResult[0].find(
        (item) => (item.json as Record<string, unknown>).id === newPayeeId,
      );
      expect((updatedEntry!.json as Record<string, unknown>).name).toBe(`${payeeName} Updated`);

      const commonResult = await runNode({ operation: "getCommonPayees", resource: "payee" });
      expect(Array.isArray(commonResult[0])).toBe(true);
    } finally {
      await runNode({ operation: "deletePayee", resource: "payee", payeeId: newPayeeId });
    }

    const finalListResult = await runNode({ operation: "getPayees", resource: "payee" });
    expect(finalListResult[0].map((item) => (item.json as Record<string, unknown>).id)).not.toContain(newPayeeId);
  }, 30000);

  it("should merge a duplicate payee into a target payee via the node", async () => {
    const targetResult = await runNode({
      operation: "createPayee",
      resource: "payee",
      name: `E2E Merge Target ${Date.now()}`,
    });
    const targetPayeeId = (targetResult[0][0].json as Record<string, unknown>).id as string;
    // Tracked outside the try so a failed merge/assertion still gets cleaned up below, rather
    // than leaving the duplicate payee behind for the next run.
    let dupePayeeId: string | undefined;

    try {
      const dupeResult = await runNode({
        operation: "createPayee",
        resource: "payee",
        name: `E2E Merge Dupe ${Date.now()}`,
      });
      dupePayeeId = (dupeResult[0][0].json as Record<string, unknown>).id as string;

      await runNode({
        operation: "mergePayees",
        resource: "payee",
        targetPayeeId,
        mergeIds: [dupePayeeId],
      });

      const listResult = await runNode({ operation: "getPayees", resource: "payee" });
      const ids = listResult[0].map((item) => (item.json as Record<string, unknown>).id);
      expect(ids).toContain(targetPayeeId);
      expect(ids).not.toContain(dupePayeeId);
    } finally {
      if (dupePayeeId) {
        const remaining = await runNode({ operation: "getPayees", resource: "payee" });
        const dupeStillExists = remaining[0].some(
          (item) => (item.json as Record<string, unknown>).id === dupePayeeId,
        );
        if (dupeStillExists) {
          await runNode({ operation: "deletePayee", resource: "payee", payeeId: dupePayeeId });
        }
      }
      await runNode({ operation: "deletePayee", resource: "payee", payeeId: targetPayeeId });
    }
  }, 30000);

  it("should wrap a nonexistent budget as a NodeApiError with the server's detail", async () => {
    // Proves NodeApiError wrapping actually works against a genuine server error, not just
    // a mocked rejection — every unit test's "error" path uses a mock, never the real API.
    const promise = runNode({
      operation: "getAccounts",
      resource: "account",
      budgetId: "nonexistent-budget-id",
    });
    await expect(promise).rejects.toBeInstanceOf(NodeApiError);
    await expect(promise).rejects.toThrow('Budget "nonexistent-budget-id" not found');
  }, 15000);

  it("should wrap a nonexistent AQL table as a NodeApiError with the server's detail", async () => {
    const promise = runNode({
      operation: "runQuery",
      resource: "query",
      table: "not_a_real_table",
      filter: "{}",
      select: '"*"',
      groupBy: "[]",
      orderBy: "[]",
      rowLimit: 0,
      offset: 0,
    });
    await expect(promise).rejects.toBeInstanceOf(NodeApiError);
    await expect(promise).rejects.toThrow('Table "not_a_real_table" does not exist');
  }, 15000);
});
