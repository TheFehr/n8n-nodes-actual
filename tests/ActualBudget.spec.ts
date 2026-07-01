import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActualBudget } from "../nodes/ActualBudget/ActualBudget.node";
import type { IDataObject, IExecuteFunctions } from "n8n-workflow";

vi.mock("@actual-app/api", () => ({
  init: vi.fn().mockResolvedValue(undefined),
  downloadBudget: vi.fn().mockResolvedValue(undefined),
  importTransactions: vi
    .fn()
    .mockResolvedValue({ added: ["tx-001"], updated: [], updatedPreview: [], errors: [] }),
  getBudgetMonth: vi.fn().mockResolvedValue({
    month: "2024-01",
    incomeAvailable: 500000,
    lastMonthOverspent: 0,
    forNextMonth: 0,
    totalBudgeted: 300000,
    toBudget: 200000,
    fromLastMonth: 0,
    totalIncome: 500000,
    totalSpent: -300000,
    totalBalance: 200000,
    categoryGroups: [],
  }),
  getTransactions: vi.fn().mockResolvedValue([
    { id: "tx-001", date: "2024-01-15", amount: -1000, account: "acc-1" },
    { id: "tx-002", date: "2024-01-20", amount: -500, account: "acc-1" },
  ]),
  setBudgetAmount: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

import * as actualApi from "@actual-app/api";

describe("ActualBudget", () => {
  let node: ActualBudget;
  let executeFunctions: IExecuteFunctions;

  beforeEach(() => {
    vi.clearAllMocks();
    node = new ActualBudget();
    executeFunctions = {
      getInputData: vi.fn().mockReturnValue([{ json: {} }]),
      getNodeParameter: vi.fn(),
      getCredentials: vi
        .fn()
        .mockResolvedValue({ url: "http://localhost:5006", password: "test-password" }),
      continueOnFail: vi.fn().mockReturnValue(false),
      getNode: vi.fn().mockReturnValue({ name: "ActualBudget" }),
      helpers: {
        returnJsonArray: vi.fn((data: unknown) =>
          Array.isArray(data)
            ? data.map((d) => ({ json: d as IDataObject }))
            : [{ json: data as IDataObject }],
        ),
        constructExecutionMetaData: vi.fn((data: unknown) => data),
      },
    } as unknown as IExecuteFunctions;
  });

  it("should call init with credentials", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -1000 }];
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.init).toHaveBeenCalledWith({
      serverURL: "http://localhost:5006",
      password: "test-password",
    });
  });

  it("should call downloadBudget with the budget ID", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "my-budget-group-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -1000 }];
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.downloadBudget).toHaveBeenCalledWith("my-budget-group-id");
  });

  it("should call importTransactions with accountId and transactions", async () => {
    const transactions = [
      { date: "2024-01-15", amount: -1000, notes: "Grocery run" },
      { date: "2024-01-16", amount: -500 },
    ];
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "account-abc";
      if (name === "transactions") return transactions;
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.importTransactions).toHaveBeenCalledWith("account-abc", transactions);
  });

  it("should parse stringified JSON transactions", async () => {
    const transactions = [{ date: "2024-02-01", amount: -750, notes: "Parsed from string" }];
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "account-abc";
      if (name === "transactions") return JSON.stringify(transactions);
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.importTransactions).toHaveBeenCalledWith("account-abc", transactions);
  });

  it("should call shutdown after successful execution", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [];
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.shutdown).toHaveBeenCalled();
  });

  it("should call shutdown even when downloadBudget throws before any items are processed", async () => {
    vi.mocked(actualApi.downloadBudget).mockRejectedValueOnce(new Error("network error"));
    executeFunctions.continueOnFail.mockReturnValue(false);
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [];
      return undefined;
    });

    await expect(node.execute.call(executeFunctions)).rejects.toThrow("network error");

    expect(actualApi.shutdown).toHaveBeenCalled();
    expect(actualApi.importTransactions).not.toHaveBeenCalled();
  });

  it("should call shutdown before re-throwing on error (continueOnFail=false)", async () => {
    const error = new Error("Import failed");
    vi.mocked(actualApi.importTransactions).mockRejectedValueOnce(error);
    executeFunctions.continueOnFail.mockReturnValue(false);
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [];
      return undefined;
    });

    await expect(node.execute.call(executeFunctions)).rejects.toThrow("Import failed");

    expect(actualApi.shutdown).toHaveBeenCalled();
  });

  it("should include error in output when continueOnFail=true", async () => {
    const error = new Error("Import failed");
    vi.mocked(actualApi.importTransactions).mockRejectedValueOnce(error);
    executeFunctions.continueOnFail.mockReturnValue(true);
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [];
      return undefined;
    });

    const result = await node.execute.call(executeFunctions);

    expect(result).toBeDefined();
    expect(actualApi.shutdown).toHaveBeenCalled();
  });

  it("should call importTransactions once per input item", async () => {
    executeFunctions.getInputData.mockReturnValue([{ json: {} }, { json: {} }, { json: {} }]);
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -100 }];
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.importTransactions).toHaveBeenCalledTimes(3);
    // init and downloadBudget are called once, not per item
    expect(actualApi.init).toHaveBeenCalledTimes(1);
    expect(actualApi.downloadBudget).toHaveBeenCalledTimes(1);
  });

  it("should return importTransactions result in output", async () => {
    const importResult = { added: ["tx-1", "tx-2"], updated: [], updatedPreview: [], errors: [] };
    vi.mocked(actualApi.importTransactions).mockResolvedValueOnce(importResult as unknown);
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -500 }];
      return undefined;
    });

    const result = await node.execute.call(executeFunctions);

    expect(result[0][0].json).toEqual(importResult);
  });

  describe("getTransactions operation", () => {
    it("should call getTransactions with correct accountId, startDate, and endDate", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-abc";
        if (name === "startDate") return "2024-01-01";
        if (name === "endDate") return "2024-01-31";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.getTransactions).toHaveBeenCalledWith("acc-abc", "2024-01-01", "2024-01-31");
    });

    it("should return each transaction as a separate output item", async () => {
      const transactions = [
        { id: "tx-1", date: "2024-01-10", amount: -2000, account: "acc-abc" },
        { id: "tx-2", date: "2024-01-15", amount: -3000, account: "acc-abc" },
        { id: "tx-3", date: "2024-01-20", amount: 5000, account: "acc-abc" },
      ];
      vi.mocked(actualApi.getTransactions).mockResolvedValueOnce(transactions as unknown);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-abc";
        if (name === "startDate") return "2024-01-01";
        if (name === "endDate") return "2024-01-31";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(result[0]).toHaveLength(3);
      expect(result[0][0].json).toEqual(transactions[0]);
      expect(result[0][1].json).toEqual(transactions[1]);
      expect(result[0][2].json).toEqual(transactions[2]);
    });

    it("should return empty output when no transactions found", async () => {
      vi.mocked(actualApi.getTransactions).mockResolvedValueOnce([]);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-abc";
        if (name === "startDate") return "2024-01-01";
        if (name === "endDate") return "2024-01-31";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(result[0]).toHaveLength(0);
    });

    it("should call getTransactions once per input item", async () => {
      const items = [
        { accountId: "acc-1", startDate: "2024-01-01", endDate: "2024-01-31" },
        { accountId: "acc-2", startDate: "2024-02-01", endDate: "2024-02-29" },
      ];
      executeFunctions.getInputData.mockReturnValue(items.map(() => ({ json: {} })));
      executeFunctions.getNodeParameter.mockImplementation((name: string, itemIndex: number) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return items[itemIndex].accountId;
        if (name === "startDate") return items[itemIndex].startDate;
        if (name === "endDate") return items[itemIndex].endDate;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.getTransactions).toHaveBeenCalledTimes(2);
      expect(actualApi.getTransactions).toHaveBeenNthCalledWith(1, "acc-1", "2024-01-01", "2024-01-31");
      expect(actualApi.getTransactions).toHaveBeenNthCalledWith(2, "acc-2", "2024-02-01", "2024-02-29");
    });

    it("should call shutdown before re-throwing on getTransactions error", async () => {
      vi.mocked(actualApi.getTransactions).mockRejectedValueOnce(new Error("account not found"));
      executeFunctions.continueOnFail.mockReturnValue(false);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-abc";
        if (name === "startDate") return "2024-01-01";
        if (name === "endDate") return "2024-01-31";
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow("account not found");

      expect(actualApi.shutdown).toHaveBeenCalled();
    });

    it("should throw on invalid startDate format", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-abc";
        if (name === "startDate") return "01/01/2024";
        if (name === "endDate") return "2024-01-31";
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/startDate.*YYYY-MM-DD/);
      expect(actualApi.getTransactions).not.toHaveBeenCalled();
    });

    it("should throw on invalid endDate format", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-abc";
        if (name === "startDate") return "2024-01-01";
        if (name === "endDate") return "not-a-date";
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/endDate.*YYYY-MM-DD/);
      expect(actualApi.getTransactions).not.toHaveBeenCalled();
    });

    it("should throw when startDate is after endDate", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-abc";
        if (name === "startDate") return "2024-02-01";
        if (name === "endDate") return "2024-01-01";
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/startDate.*endDate/);
      expect(actualApi.getTransactions).not.toHaveBeenCalled();
    });

    it("should capture validation error in output when continueOnFail=true", async () => {
      executeFunctions.continueOnFail.mockReturnValue(true);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTransactions";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-abc";
        if (name === "startDate") return "01/01/2024";
        if (name === "endDate") return "2024-01-31";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(result).toBeDefined();
      expect(actualApi.getTransactions).not.toHaveBeenCalled();
    });
  });

  describe("getBudgetMonth operation", () => {
    it("should call getBudgetMonth with the correct month parameter", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getBudgetMonth";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.getBudgetMonth).toHaveBeenCalledWith("2024-03");
    });

    it("should return getBudgetMonth result in output", async () => {
      const budgetData = {
        month: "2024-03",
        toBudget: 150000,
        totalIncome: 600000,
        totalSpent: -450000,
        totalBalance: 150000,
        incomeAvailable: 600000,
        lastMonthOverspent: 0,
        forNextMonth: 0,
        totalBudgeted: 450000,
        fromLastMonth: 0,
        categoryGroups: [{ id: "grp-1", name: "Food" }],
      };
      vi.mocked(actualApi.getBudgetMonth).mockResolvedValueOnce(budgetData as unknown);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getBudgetMonth";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(result[0][0].json).toEqual(budgetData);
    });

    it("should call getBudgetMonth once per input item", async () => {
      executeFunctions.getInputData.mockReturnValue([{ json: {} }, { json: {} }, { json: {} }]);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getBudgetMonth";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getBudgetMonth).toHaveBeenCalledTimes(3);
      expect(result[0]).toHaveLength(3);
    });

    it("should call shutdown before re-throwing on getBudgetMonth error", async () => {
      vi.mocked(actualApi.getBudgetMonth).mockRejectedValueOnce(new Error("month not found"));
      executeFunctions.continueOnFail.mockReturnValue(false);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getBudgetMonth";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow("month not found");

      expect(actualApi.shutdown).toHaveBeenCalled();
    });
  });

  describe("setBudgetAmount operation", () => {
    it("should call setBudgetAmount with correct month, categoryId, and amount", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "categoryId") return "cat-abc";
        if (name === "amount") return 100000;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.setBudgetAmount).toHaveBeenCalledWith("2024-03", "cat-abc", 100000);
    });

    it("should return echo object with written parameters", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "categoryId") return "cat-abc";
        if (name === "amount") return 100000;
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(result[0][0].json).toEqual({ success: true, month: "2024-03", categoryId: "cat-abc", amount: 100000 });
    });

    it("should call setBudgetAmount once per input item", async () => {
      const items = [
        { month: "2024-03", categoryId: "cat-1", amount: 50000 },
        { month: "2024-03", categoryId: "cat-2", amount: 75000 },
        { month: "2024-03", categoryId: "cat-3", amount: 25000 },
      ];
      executeFunctions.getInputData.mockReturnValue(items.map(() => ({ json: {} })));
      executeFunctions.getNodeParameter.mockImplementation((name: string, itemIndex: number) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return items[itemIndex].month;
        if (name === "categoryId") return items[itemIndex].categoryId;
        if (name === "amount") return items[itemIndex].amount;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.setBudgetAmount).toHaveBeenCalledTimes(3);
      expect(actualApi.setBudgetAmount).toHaveBeenNthCalledWith(1, "2024-03", "cat-1", 50000);
      expect(actualApi.setBudgetAmount).toHaveBeenNthCalledWith(2, "2024-03", "cat-2", 75000);
      expect(actualApi.setBudgetAmount).toHaveBeenNthCalledWith(3, "2024-03", "cat-3", 25000);
    });

    it("should call shutdown before re-throwing on setBudgetAmount error", async () => {
      vi.mocked(actualApi.setBudgetAmount).mockRejectedValueOnce(new Error("write failed"));
      executeFunctions.continueOnFail.mockReturnValue(false);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "categoryId") return "cat-abc";
        if (name === "amount") return 100000;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow("write failed");

      expect(actualApi.shutdown).toHaveBeenCalled();
    });

    it("should include error in output when continueOnFail=true", async () => {
      vi.mocked(actualApi.setBudgetAmount).mockRejectedValueOnce(new Error("write failed"));
      executeFunctions.continueOnFail.mockReturnValue(true);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "categoryId") return "cat-abc";
        if (name === "amount") return 100000;
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(result).toBeDefined();
      expect(actualApi.shutdown).toHaveBeenCalled();
    });
  });

  describe("concurrent executions", () => {
    // Regression test for a production crash: @actual-app/api keeps its session
    // (DB connection, sync clock) in a module-level singleton. Before the fix, a second
    // execute() call could run init()/downloadBudget() while a first call was still
    // mid-operation, and the first call's shutdown() could tear down state the second
    // was relying on. Executions must now be fully serialized.
    afterEach(() => {
      // These tests replace implementations directly (mockImplementation), which
      // vi.clearAllMocks() in the outer beforeEach does not undo — restore the
      // module's default mocks so later tests aren't affected.
      vi.mocked(actualApi.init).mockResolvedValue(undefined);
      vi.mocked(actualApi.downloadBudget).mockResolvedValue(undefined);
      vi.mocked(actualApi.importTransactions).mockResolvedValue({
        added: ["tx-001"],
        updated: [],
        updatedPreview: [],
        errors: [],
      } as unknown as IDataObject);
      vi.mocked(actualApi.shutdown).mockResolvedValue(undefined);
    });

    const makeExecuteFunctions = (budgetId: string, accountId: string) =>
      ({
        getInputData: () => [{ json: {} }],
        getNodeParameter: (name: string) => {
          if (name === "operation") return "importTransactions";
          if (name === "budgetId") return budgetId;
          if (name === "accountId") return accountId;
          if (name === "transactions") return [{ date: "2024-01-15", amount: -100 }];
          return undefined;
        },
        getCredentials: async () => ({ url: "http://localhost:5006", password: "test-password" }),
        continueOnFail: () => false,
        helpers: {
          returnJsonArray: (data: unknown) =>
            Array.isArray(data)
              ? data.map((d) => ({ json: d as IDataObject }))
              : [{ json: data as IDataObject }],
          constructExecutionMetaData: (data: unknown) => data,
        },
      }) as unknown as IExecuteFunctions;

    it("should not start a second execution's init/downloadBudget until the first has fully shut down", async () => {
      const callOrder: string[] = [];
      let releaseFirstImport: () => void = () => {};
      const firstImportGate = new Promise<void>((resolve) => {
        releaseFirstImport = resolve;
      });

      vi.mocked(actualApi.init).mockImplementation(async () => {
        callOrder.push("init");
      });
      vi.mocked(actualApi.downloadBudget).mockImplementation(async (id: string) => {
        callOrder.push(`downloadBudget:${id}`);
      });
      vi.mocked(actualApi.importTransactions).mockImplementation(async (accountId: string) => {
        callOrder.push(`importTransactions:${accountId}`);
        if (accountId === "account-A") {
          await firstImportGate;
        }
        return { added: [], updated: [], updatedPreview: [], errors: [] };
      });
      vi.mocked(actualApi.shutdown).mockImplementation(async () => {
        callOrder.push("shutdown");
      });

      const nodeA = new ActualBudget();
      const nodeB = new ActualBudget();

      const execA = nodeA.execute.call(makeExecuteFunctions("budget-A", "account-A"));
      // Let execution A block on its (gated) importTransactions call before starting B.
      await vi.waitFor(() => expect(callOrder).toContain("importTransactions:account-A"));

      // B is chained behind A the instant execute() is called (runExclusive appends to the
      // shared queue synchronously) — there's no scheduling delay to race against, so B
      // cannot reach downloadBudget before A's gated importTransactions is released. The
      // final callOrder assertion below is the deterministic proof of that ordering.
      const execB = nodeB.execute.call(makeExecuteFunctions("budget-B", "account-B"));

      releaseFirstImport();
      await Promise.all([execA, execB]);

      expect(callOrder).toEqual([
        "init",
        "downloadBudget:budget-A",
        "importTransactions:account-A",
        "shutdown",
        "init",
        "downloadBudget:budget-B",
        "importTransactions:account-B",
        "shutdown",
      ]);
    });
  });
});
