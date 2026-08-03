import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActualBudgetV2 } from "../nodes/ActualBudget/v2/ActualBudgetV2.node";
import { noteFields } from "../nodes/ActualBudget/v2/actions/note";
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
  getAccounts: vi.fn().mockResolvedValue([
    { id: "acc-1", name: "Checking" },
    { id: "acc-2", name: "Savings" },
  ]),
  getCategories: vi.fn().mockResolvedValue([
    { id: "cat-1", name: "Groceries", group_id: "grp-1" },
  ]),
  getCategoryGroups: vi.fn().mockResolvedValue([
    { id: "grp-1", name: "Food", categories: [{ id: "cat-1", name: "Groceries" }] },
  ]),
  getPayees: vi.fn().mockResolvedValue([
    { id: "payee-1", name: "Landlord" },
  ]),
  createAccount: vi.fn().mockResolvedValue("acc-new"),
  updateAccount: vi.fn().mockResolvedValue(undefined),
  closeAccount: vi.fn().mockResolvedValue(undefined),
  reopenAccount: vi.fn().mockResolvedValue(undefined),
  deleteAccount: vi.fn().mockResolvedValue(undefined),
  getAccountBalance: vi.fn().mockResolvedValue(123400),
  createCategory: vi.fn().mockResolvedValue("cat-new"),
  updateCategory: vi.fn().mockResolvedValue(undefined),
  deleteCategory: vi.fn().mockResolvedValue(undefined),
  createCategoryGroup: vi.fn().mockResolvedValue("grp-new"),
  updateCategoryGroup: vi.fn().mockResolvedValue(undefined),
  deleteCategoryGroup: vi.fn().mockResolvedValue(undefined),
  createPayee: vi.fn().mockResolvedValue("payee-new"),
  updatePayee: vi.fn().mockResolvedValue(undefined),
  deletePayee: vi.fn().mockResolvedValue(undefined),
  mergePayees: vi.fn().mockResolvedValue(undefined),
  getCommonPayees: vi.fn().mockResolvedValue([{ id: "payee-1", name: "Landlord" }]),
  addTransactions: vi.fn().mockResolvedValue("ok"),
  updateTransaction: vi.fn().mockResolvedValue([{ id: "tx-001" }]),
  deleteTransaction: vi.fn().mockResolvedValue([{ id: "tx-001" }]),
  getRules: vi.fn().mockResolvedValue([{ id: "rule-1", stage: null, conditionsOp: "and", conditions: [], actions: [] }]),
  getPayeeRules: vi.fn().mockResolvedValue([{ id: "rule-1", stage: null, conditionsOp: "and", conditions: [], actions: [] }]),
  createRule: vi.fn().mockResolvedValue({ id: "rule-new", stage: null, conditionsOp: "and", conditions: [], actions: [] }),
  updateRule: vi.fn().mockResolvedValue({ id: "rule-1", stage: null, conditionsOp: "and", conditions: [], actions: [] }),
  deleteRule: vi.fn().mockResolvedValue(true),
  getSchedules: vi.fn().mockResolvedValue([{ id: "sched-1", name: "Rent" }]),
  createSchedule: vi.fn().mockResolvedValue("sched-new"),
  updateSchedule: vi.fn().mockResolvedValue("sched-1"),
  deleteSchedule: vi.fn().mockResolvedValue(undefined),
  getTags: vi.fn().mockResolvedValue([{ id: "tag-1", tag: "#reimbursable", color: "", description: "" }]),
  createTag: vi.fn().mockResolvedValue("tag-new"),
  updateTag: vi.fn().mockResolvedValue(undefined),
  deleteTag: vi.fn().mockResolvedValue(undefined),
  getNote: vi.fn().mockResolvedValue({ id: "acc-1", note: "Existing note" }),
  updateNote: vi.fn().mockResolvedValue(undefined),
  getBudgetMonths: vi.fn().mockResolvedValue(["2024-01", "2024-02", "2024-03"]),
  getBudgets: vi.fn().mockResolvedValue([{ id: "file-1", name: "My Budget", cloudFileId: "cloud-1" }]),
  getPreferences: vi.fn().mockResolvedValue({ dateFormat: "MM/dd/yyyy" }),
  getServerVersion: vi.fn().mockResolvedValue({ version: "25.0.0" }),
  setBudgetCarryover: vi.fn().mockResolvedValue(undefined),
  holdBudgetForNextMonth: vi.fn().mockResolvedValue(true),
  resetBudgetHold: vi.fn().mockResolvedValue(undefined),
  runBankSync: vi.fn().mockResolvedValue(undefined),
  sync: vi.fn().mockResolvedValue(undefined),
  q: vi.fn(),
  aqlQuery: vi.fn().mockResolvedValue([]),
}));

import * as actualApi from "@actual-app/api";

describe("ActualBudget", () => {
  let node: ActualBudgetV2;
  let executeFunctions: IExecuteFunctions;

  beforeEach(() => {
    vi.clearAllMocks();
    node = new ActualBudgetV2();
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
      if (name === "resource") return "transaction";
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
      if (name === "resource") return "transaction";
      if (name === "budgetId") return "my-budget-group-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -1000 }];
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.downloadBudget).toHaveBeenCalledWith("my-budget-group-id");
  });

  it("should re-download the budget when budgetId differs between items, and skip it when unchanged", async () => {
    const items = [
      { budgetId: "budget-A", accountId: "account-1" },
      { budgetId: "budget-A", accountId: "account-2" },
      { budgetId: "budget-B", accountId: "account-3" },
    ];
    executeFunctions.getInputData.mockReturnValue(items.map(() => ({ json: {} })));
    executeFunctions.getNodeParameter.mockImplementation((name: string, itemIndex: number) => {
      if (name === "operation") return "importTransactions";
      if (name === "resource") return "transaction";
      if (name === "budgetId") return items[itemIndex].budgetId;
      if (name === "accountId") return items[itemIndex].accountId;
      if (name === "transactions") return [{ date: "2024-01-15", amount: -100 }];
      return undefined;
    });

    await node.execute.call(executeFunctions);

    // Same budgetId for items 0 and 1 -> only one download; item 2's different budgetId
    // triggers a second one.
    expect(actualApi.downloadBudget).toHaveBeenCalledTimes(2);
    expect(actualApi.downloadBudget).toHaveBeenNthCalledWith(1, "budget-A");
    expect(actualApi.downloadBudget).toHaveBeenNthCalledWith(2, "budget-B");
    expect(actualApi.importTransactions).toHaveBeenCalledTimes(3);
  });

  it("should call importTransactions with accountId and transactions", async () => {
    const transactions = [
      { date: "2024-01-15", amount: -1000, notes: "Grocery run" },
      { date: "2024-01-16", amount: -500 },
    ];
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "resource") return "transaction";
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
      if (name === "resource") return "transaction";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "account-abc";
      if (name === "transactions") return JSON.stringify(transactions);
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.importTransactions).toHaveBeenCalledWith("account-abc", transactions);
  });

  it("should throw when a transaction's date is not a string", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "resource") return "transaction";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "account-abc";
      if (name === "transactions") return [{ date: 20240201, amount: -750 }];
      return undefined;
    });

    await expect(node.execute.call(executeFunctions)).rejects.toThrow(/"date"/);
    expect(actualApi.importTransactions).not.toHaveBeenCalled();
  });

  it("should throw when a transaction's amount is not a number", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "resource") return "transaction";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "account-abc";
      if (name === "transactions") return [{ date: "2024-02-01", amount: "100" }];
      return undefined;
    });

    await expect(node.execute.call(executeFunctions)).rejects.toThrow(/"amount"/);
    expect(actualApi.importTransactions).not.toHaveBeenCalled();
  });

  it("should throw when a transaction's amount is not finite (Infinity/NaN)", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "resource") return "transaction";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "account-abc";
      if (name === "transactions") return [{ date: "2024-02-01", amount: Infinity }];
      return undefined;
    });

    await expect(node.execute.call(executeFunctions)).rejects.toThrow(/"amount"/);
    expect(actualApi.importTransactions).not.toHaveBeenCalled();
  });

  it("should call shutdown after successful execution", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "resource") return "transaction";
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
      if (name === "resource") return "transaction";
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
      if (name === "resource") return "transaction";
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
      if (name === "resource") return "transaction";
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
      if (name === "resource") return "transaction";
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
      if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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
        if (name === "resource") return "transaction";
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

  describe("addTransactions operation", () => {
    it("should call addTransactions with accountId, transactions, and options", async () => {
      const transactions = [{ date: "2024-01-15", amount: -1000 }];
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "addTransactions";
        if (name === "resource") return "transaction";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "account-abc";
        if (name === "transactions") return transactions;
        if (name === "learnCategories") return true;
        if (name === "runTransfers") return false;
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.addTransactions).toHaveBeenCalledWith("account-abc", transactions, {
        learnCategories: true,
        runTransfers: false,
      });
      expect(result[0][0].json).toEqual({ result: "ok" });
    });
  });

  describe("updateTransaction operation", () => {
    it("should call updateTransaction with the transaction ID and update fields", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateTransaction";
        if (name === "resource") return "transaction";
        if (name === "budgetId") return "test-budget-id";
        if (name === "transactionId") return "tx-001";
        if (name === "updateFields") return { notes: "Updated" };
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateTransaction).toHaveBeenCalledWith("tx-001", { notes: "Updated" });
    });
  });

  describe("deleteTransaction operation", () => {
    it("should call deleteTransaction with the transaction ID", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "deleteTransaction";
        if (name === "resource") return "transaction";
        if (name === "budgetId") return "test-budget-id";
        if (name === "transactionId") return "tx-001";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.deleteTransaction).toHaveBeenCalledWith("tx-001");
    });
  });

  describe("getBudgetMonth operation", () => {
    it("should call getBudgetMonth with the correct month parameter", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getBudgetMonth";
        if (name === "resource") return "budget";
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
        if (name === "resource") return "budget";
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
        if (name === "resource") return "budget";
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
        if (name === "resource") return "budget";
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
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "categoryId") return "cat-abc";
        if (name === "amount") return 100000;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.setBudgetAmount).toHaveBeenCalledWith("2024-03", "cat-abc", 100000);
    });

    it("should throw on a fractional (non-integer) amount", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "categoryId") return "cat-abc";
        if (name === "amount") return 100.5;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/integer/);
      expect(actualApi.setBudgetAmount).not.toHaveBeenCalled();
    });

    it("should return echo object with written parameters", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "setBudgetAmount";
        if (name === "resource") return "budget";
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
        if (name === "resource") return "budget";
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
        if (name === "resource") return "budget";
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
        if (name === "resource") return "budget";
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

  describe("budget mechanics operations", () => {
    it("should call getBudgetMonths and return each month as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getBudgetMonths";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getBudgetMonths).toHaveBeenCalled();
      expect(result[0].map((item) => item.json)).toEqual([
        { month: "2024-01" },
        { month: "2024-02" },
        { month: "2024-03" },
      ]);
    });

    it("should call getBudgets and return each budget file as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getBudgets";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getBudgets).toHaveBeenCalled();
      expect(result[0]).toHaveLength(1);
    });

    it("should call getPreferences", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getPreferences";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getPreferences).toHaveBeenCalled();
      expect(result[0][0].json).toEqual({ dateFormat: "MM/dd/yyyy" });
    });

    it("should call getServerVersion", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getServerVersion";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getServerVersion).toHaveBeenCalled();
      expect(result[0][0].json).toEqual({ version: "25.0.0" });
    });

    it("should call setBudgetCarryover with month, categoryId, and carryover flag", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "setBudgetCarryover";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "categoryId") return "cat-abc";
        if (name === "carryover") return true;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.setBudgetCarryover).toHaveBeenCalledWith("2024-03", "cat-abc", true);
    });

    it("should call holdBudgetForNextMonth with month and amount", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "holdBudgetForNextMonth";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "amount") return 20000;
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.holdBudgetForNextMonth).toHaveBeenCalledWith("2024-03", 20000);
      expect(result[0][0].json).toEqual({ success: true, month: "2024-03", amount: 20000 });
    });

    it("should reject a fractional amount for holdBudgetForNextMonth", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "holdBudgetForNextMonth";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        if (name === "amount") return 200.5;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(
        '"amount" must be an integer number of millicents',
      );
      expect(actualApi.holdBudgetForNextMonth).not.toHaveBeenCalled();
    });

    it("should call resetBudgetHold with month", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "resetBudgetHold";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        if (name === "month") return "2024-03";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.resetBudgetHold).toHaveBeenCalledWith("2024-03");
    });

    it("should call sync", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "sync";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.sync).toHaveBeenCalled();
      expect(result[0][0].json).toEqual({ success: true });
    });

    it("should call runBankSync with the resolved account ID when provided", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "runBankSync";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-1";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.runBankSync).toHaveBeenCalledWith({ accountId: "acc-1" });
    });

    it("should call runBankSync with no args when account is not provided", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "runBankSync";
        if (name === "resource") return "budget";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.runBankSync).toHaveBeenCalledWith(undefined);
    });
  });

  describe("account resource", () => {
    it("should call getAccounts and return each account as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getAccounts";
        if (name === "resource") return "account";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getAccounts).toHaveBeenCalled();
      expect(result[0].map((item) => item.json)).toEqual([
        { id: "acc-1", name: "Checking" },
        { id: "acc-2", name: "Savings" },
      ]);
    });

    it("should call createAccount with name, offbudget, and initialBalance", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createAccount";
        if (name === "resource") return "account";
        if (name === "budgetId") return "test-budget-id";
        if (name === "name") return "New Account";
        if (name === "offbudget") return true;
        if (name === "initialBalance") return 5000;
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.createAccount).toHaveBeenCalledWith(
        { name: "New Account", offbudget: true },
        5000,
      );
      expect(result[0][0].json).toEqual({ id: "acc-new", name: "New Account", offbudget: true });
    });

    it("should call updateAccount with the resolved account ID and update fields", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateAccount";
        if (name === "resource") return "account";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-1";
        if (name === "updateFields") return { name: "Renamed" };
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateAccount).toHaveBeenCalledWith("acc-1", { name: "Renamed" });
    });

    it("should call closeAccount with transfer account/category when provided", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "closeAccount";
        if (name === "resource") return "account";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-1";
        if (name === "transferAccountId") return "acc-2";
        if (name === "transferCategoryId") return "cat-1";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.closeAccount).toHaveBeenCalledWith("acc-1", "acc-2", "cat-1");
    });

    it("should call reopenAccount with the resolved account ID", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "reopenAccount";
        if (name === "resource") return "account";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-1";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.reopenAccount).toHaveBeenCalledWith("acc-1");
    });

    it("should call deleteAccount with the resolved account ID", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "deleteAccount";
        if (name === "resource") return "account";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-1";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.deleteAccount).toHaveBeenCalledWith("acc-1");
    });

    it("should call getAccountBalance with the resolved account ID and no cutoff when unset", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getAccountBalance";
        if (name === "resource") return "account";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-1";
        if (name === "cutoff") return "";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getAccountBalance).toHaveBeenCalledWith("acc-1", undefined);
      expect(result[0][0].json).toEqual({ id: "acc-1", balance: 123400 });
    });

    it("should call getAccountBalance with a cutoff Date when provided", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getAccountBalance";
        if (name === "resource") return "account";
        if (name === "budgetId") return "test-budget-id";
        if (name === "accountId") return "acc-1";
        if (name === "cutoff") return "2024-03-01T00:00:00.000Z";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.getAccountBalance).toHaveBeenCalledWith(
        "acc-1",
        new Date("2024-03-01T00:00:00.000Z"),
      );
    });
  });

  describe("category resource", () => {
    it("should call getCategories and return each category as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getCategories";
        if (name === "resource") return "category";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getCategories).toHaveBeenCalled();
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({ id: "cat-1", name: "Groceries", group_id: "grp-1" });
    });

    it("should call createCategory with name, group_id, is_income, and hidden", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createCategory";
        if (name === "resource") return "category";
        if (name === "budgetId") return "test-budget-id";
        if (name === "name") return "Utilities";
        if (name === "groupId") return "grp-1";
        if (name === "is_income") return false;
        if (name === "hidden") return false;
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.createCategory).toHaveBeenCalledWith({
        name: "Utilities",
        group_id: "grp-1",
        is_income: false,
        hidden: false,
      });
      expect(result[0][0].json).toMatchObject({ id: "cat-new", name: "Utilities" });
    });

    it("should call updateCategory with the resolved category ID and update fields", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateCategory";
        if (name === "resource") return "category";
        if (name === "budgetId") return "test-budget-id";
        if (name === "categoryId") return "cat-1";
        if (name === "updateFields") return { name: "Groceries & Household" };
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateCategory).toHaveBeenCalledWith("cat-1", { name: "Groceries & Household" });
    });

    it("should call updateCategory with group_id and is_income together", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateCategory";
        if (name === "resource") return "category";
        if (name === "budgetId") return "test-budget-id";
        if (name === "categoryId") return "cat-1";
        if (name === "updateFields") return { group_id: "grp-2", is_income: true };
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateCategory).toHaveBeenCalledWith("cat-1", { group_id: "grp-2", is_income: true });
    });

    it("should call deleteCategory with the resolved category ID and transfer category", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "deleteCategory";
        if (name === "resource") return "category";
        if (name === "budgetId") return "test-budget-id";
        if (name === "categoryId") return "cat-1";
        if (name === "transferCategoryId") return "cat-2";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.deleteCategory).toHaveBeenCalledWith("cat-1", "cat-2");
    });
  });

  describe("categoryGroup resource", () => {
    it("should call getCategoryGroups and return each group as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getCategoryGroups";
        if (name === "resource") return "categoryGroup";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getCategoryGroups).toHaveBeenCalled();
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({
        id: "grp-1",
        name: "Food",
        categories: [{ id: "cat-1", name: "Groceries" }],
      });
    });

    it("should call createCategoryGroup with name, is_income, and hidden", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createCategoryGroup";
        if (name === "resource") return "categoryGroup";
        if (name === "budgetId") return "test-budget-id";
        if (name === "name") return "Subscriptions";
        if (name === "is_income") return false;
        if (name === "hidden") return false;
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.createCategoryGroup).toHaveBeenCalledWith({
        name: "Subscriptions",
        is_income: false,
        hidden: false,
      });
      expect(result[0][0].json).toMatchObject({ id: "grp-new", name: "Subscriptions" });
    });

    it("should call updateCategoryGroup with the resolved group ID and update fields", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateCategoryGroup";
        if (name === "resource") return "categoryGroup";
        if (name === "budgetId") return "test-budget-id";
        if (name === "categoryGroupId") return "grp-1";
        if (name === "updateFields") return { hidden: true };
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateCategoryGroup).toHaveBeenCalledWith("grp-1", { hidden: true });
    });

    it("should call deleteCategoryGroup with the resolved group ID and transfer category", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "deleteCategoryGroup";
        if (name === "resource") return "categoryGroup";
        if (name === "budgetId") return "test-budget-id";
        if (name === "categoryGroupId") return "grp-1";
        if (name === "transferCategoryId") return "cat-2";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.deleteCategoryGroup).toHaveBeenCalledWith("grp-1", "cat-2");
    });
  });

  describe("payee resource", () => {
    it("should call getPayees and return each payee as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getPayees";
        if (name === "resource") return "payee";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getPayees).toHaveBeenCalled();
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({ id: "payee-1", name: "Landlord" });
    });

    it("should call getCommonPayees and return each payee as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getCommonPayees";
        if (name === "resource") return "payee";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getCommonPayees).toHaveBeenCalled();
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({ id: "payee-1", name: "Landlord" });
    });

    it("should call createPayee with the given name", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createPayee";
        if (name === "resource") return "payee";
        if (name === "budgetId") return "test-budget-id";
        if (name === "name") return "New Payee";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.createPayee).toHaveBeenCalledWith({ name: "New Payee" });
      expect(result[0][0].json).toEqual({ id: "payee-new", name: "New Payee" });
    });

    it("should call updatePayee with the resolved payee ID and update fields", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updatePayee";
        if (name === "resource") return "payee";
        if (name === "budgetId") return "test-budget-id";
        if (name === "payeeId") return "payee-1";
        if (name === "updateFields") return { name: "Renamed Payee" };
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updatePayee).toHaveBeenCalledWith("payee-1", { name: "Renamed Payee" });
    });

    it("should call deletePayee with the resolved payee ID", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "deletePayee";
        if (name === "resource") return "payee";
        if (name === "budgetId") return "test-budget-id";
        if (name === "payeeId") return "payee-1";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.deletePayee).toHaveBeenCalledWith("payee-1");
    });

    it("should call mergePayees with the target and merge IDs", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "mergePayees";
        if (name === "resource") return "payee";
        if (name === "budgetId") return "test-budget-id";
        if (name === "targetPayeeId") return "payee-1";
        if (name === "mergeIds") return ["payee-2", "payee-3"];
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.mergePayees).toHaveBeenCalledWith("payee-1", ["payee-2", "payee-3"]);
    });
  });

  describe("rule resource", () => {
    it("should call getRules and return each rule as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getRules";
        if (name === "resource") return "rule";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getRules).toHaveBeenCalled();
      expect(result[0]).toHaveLength(1);
    });

    it("should call getPayeeRules with the resolved payee ID", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getPayeeRules";
        if (name === "resource") return "rule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "payeeId") return "payee-1";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.getPayeeRules).toHaveBeenCalledWith("payee-1");
    });

    it("should call createRule with the parsed rule JSON", async () => {
      const rule = { stage: null, conditionsOp: "and", conditions: [], actions: [] };
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createRule";
        if (name === "resource") return "rule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "rule") return JSON.stringify(rule);
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.createRule).toHaveBeenCalledWith(rule);
    });

    it("should throw on invalid rule JSON", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createRule";
        if (name === "resource") return "rule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "rule") return "not json";
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/invalid JSON/);
    });

    it("should call updateRule with the id merged into the parsed rule JSON", async () => {
      const rule = { stage: null, conditionsOp: "and", conditions: [], actions: [] };
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateRule";
        if (name === "resource") return "rule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "ruleId") return "rule-1";
        if (name === "rule") return JSON.stringify(rule);
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateRule).toHaveBeenCalledWith({ id: "rule-1", ...rule });
    });

    it("should let the selected Rule ID win over a conflicting id in the rule JSON body", async () => {
      const rule = { id: "rule-from-json-should-be-ignored", stage: null, conditionsOp: "and", conditions: [], actions: [] };
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateRule";
        if (name === "resource") return "rule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "ruleId") return "rule-1";
        if (name === "rule") return JSON.stringify(rule);
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateRule).toHaveBeenCalledWith({ ...rule, id: "rule-1" });
    });

    it("should call deleteRule with the rule ID", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "deleteRule";
        if (name === "resource") return "rule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "ruleId") return "rule-1";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.deleteRule).toHaveBeenCalledWith("rule-1");
      expect(result[0][0].json).toEqual({ success: true, id: "rule-1" });
    });
  });

  describe("schedule resource", () => {
    it("should call getSchedules and return each schedule as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getSchedules";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getSchedules).toHaveBeenCalled();
      expect(result[0]).toHaveLength(1);
    });

    it("should call createSchedule with the resolved account/payee and other fields", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "name") return "Rent";
        if (name === "accountId") return "acc-1";
        if (name === "payeeId") return "payee-1";
        if (name === "amount") return -150000;
        if (name === "amountOp") return "is";
        if (name === "date") return '"2024-04-01"';
        if (name === "posts_transaction") return true;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.createSchedule).toHaveBeenCalledWith({
        name: "Rent",
        account: "acc-1",
        payee: "payee-1",
        amount: -150000,
        amountOp: "is",
        date: "2024-04-01",
        posts_transaction: true,
      });
    });

    it("should call createSchedule with a {num1, num2} amount range when Amount Operator is Is Between", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "name") return "Utilities";
        if (name === "accountId") return "acc-1";
        if (name === "payeeId") return "payee-1";
        if (name === "amountOp") return "isbetween";
        if (name === "amountLower") return -200000;
        if (name === "amountUpper") return -100000;
        if (name === "date") return '"2024-04-01"';
        if (name === "posts_transaction") return true;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.createSchedule).toHaveBeenCalledWith({
        name: "Utilities",
        account: "acc-1",
        payee: "payee-1",
        amount: { num1: -200000, num2: -100000 },
        amountOp: "isbetween",
        date: "2024-04-01",
        posts_transaction: true,
      });
    });

    it("should throw when creating with Is Between and Amount Lower exceeds Amount Upper", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "name") return "Utilities";
        if (name === "accountId") return "acc-1";
        if (name === "payeeId") return "payee-1";
        if (name === "amountOp") return "isbetween";
        if (name === "amountLower") return -100000;
        if (name === "amountUpper") return -200000;
        if (name === "date") return '"2024-04-01"';
        if (name === "posts_transaction") return true;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/Amount Lower.*Amount Upper/);
      expect(actualApi.createSchedule).not.toHaveBeenCalled();
    });

    it("should throw when creating a schedule with an empty date", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "name") return "Rent";
        if (name === "accountId") return "acc-1";
        if (name === "payeeId") return "payee-1";
        if (name === "amount") return -150000;
        if (name === "amountOp") return "is";
        if (name === "date") return '""';
        if (name === "posts_transaction") return true;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/"date"/);
      expect(actualApi.createSchedule).not.toHaveBeenCalled();
    });

    it("should call updateSchedule with the resolved schedule ID, fields, and resetNextDate", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "scheduleId") return "sched-1";
        if (name === "updateFields") return { amount: -160000 };
        if (name === "resetNextDate") return true;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateSchedule).toHaveBeenCalledWith("sched-1", { amount: -160000 }, true);
    });

    it("should call updateSchedule with a {num1, num2} amount range when Amount Operator is Is Between", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "scheduleId") return "sched-1";
        if (name === "updateFields") return { amountOp: "isbetween", amountLower: -200000, amountUpper: -100000 };
        if (name === "resetNextDate") return false;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateSchedule).toHaveBeenCalledWith(
        "sched-1",
        { amountOp: "isbetween", amount: { num1: -200000, num2: -100000 } },
        false,
      );
    });

    it("should throw when updating with Is Between but Amount Lower/Upper are missing", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "scheduleId") return "sched-1";
        if (name === "updateFields") return { amountOp: "isbetween" };
        if (name === "resetNextDate") return false;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/Amount Lower.*Amount Upper/);
      expect(actualApi.updateSchedule).not.toHaveBeenCalled();
    });

    it("should throw when updating with Is Between and Amount Lower exceeds Amount Upper", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "scheduleId") return "sched-1";
        if (name === "updateFields") return { amountOp: "isbetween", amountLower: -100000, amountUpper: -200000 };
        if (name === "resetNextDate") return false;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/Amount Lower.*Amount Upper/);
      expect(actualApi.updateSchedule).not.toHaveBeenCalled();
    });

    it("should throw when updating a schedule with an empty date", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "scheduleId") return "sched-1";
        if (name === "updateFields") return { date: '""' };
        if (name === "resetNextDate") return false;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/"date"/);
      expect(actualApi.updateSchedule).not.toHaveBeenCalled();
    });

    it("should call deleteSchedule with the schedule ID", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "deleteSchedule";
        if (name === "resource") return "schedule";
        if (name === "budgetId") return "test-budget-id";
        if (name === "scheduleId") return "sched-1";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.deleteSchedule).toHaveBeenCalledWith("sched-1");
    });
  });

  describe("tag resource", () => {
    it("should call getTags and return each tag as a separate output item", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getTags";
        if (name === "resource") return "tag";
        if (name === "budgetId") return "test-budget-id";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getTags).toHaveBeenCalled();
      expect(result[0]).toHaveLength(1);
    });

    it("should call createTag with tag, color, and description", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "createTag";
        if (name === "resource") return "tag";
        if (name === "budgetId") return "test-budget-id";
        if (name === "tag") return "#travel";
        if (name === "color") return "#ff0000";
        if (name === "description") return "Travel expenses";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.createTag).toHaveBeenCalledWith({
        tag: "#travel",
        color: "#ff0000",
        description: "Travel expenses",
      });
    });

    it("should call updateTag with the resolved tag ID and update fields", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateTag";
        if (name === "resource") return "tag";
        if (name === "budgetId") return "test-budget-id";
        if (name === "tagId") return "tag-1";
        if (name === "updateFields") return { color: "#00ff00" };
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateTag).toHaveBeenCalledWith("tag-1", { color: "#00ff00" });
    });

    it("should call deleteTag with the resolved tag ID", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "deleteTag";
        if (name === "resource") return "tag";
        if (name === "budgetId") return "test-budget-id";
        if (name === "tagId") return "tag-1";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.deleteTag).toHaveBeenCalledWith("tag-1");
    });
  });

  describe("note resource", () => {
    it("should call getNote with the entity ID and return the note", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "getNote";
        if (name === "resource") return "note";
        if (name === "budgetId") return "test-budget-id";
        if (name === "entityId") return "acc-1";
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(actualApi.getNote).toHaveBeenCalledWith("acc-1");
      expect(result[0][0].json).toEqual({ id: "acc-1", note: "Existing note" });
    });

    it("should call updateNote with the entity ID and note text", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateNote";
        if (name === "resource") return "note";
        if (name === "budgetId") return "test-budget-id";
        if (name === "entityId") return "acc-1";
        if (name === "note") return "New note text";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateNote).toHaveBeenCalledWith("acc-1", "New note text");
    });

    it("should allow clearing a note by passing an empty string", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "updateNote";
        if (name === "resource") return "note";
        if (name === "budgetId") return "test-budget-id";
        if (name === "entityId") return "acc-1";
        if (name === "note") return "";
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.updateNote).toHaveBeenCalledWith("acc-1", "");
    });

    it("note field definition should not mark 'note' as required, so empty strings pass n8n's own validation", () => {
      const noteField = noteFields.find((field) => field.name === "note");
      expect(noteField?.required).not.toBe(true);
    });
  });

  describe("query resource", () => {
    function createFakeQuery() {
      const fake: Record<string, unknown> = {};
      for (const method of ["filter", "select", "groupBy", "orderBy", "limit", "offset"]) {
        fake[method] = vi.fn().mockReturnValue(fake);
      }
      return fake as {
        filter: ReturnType<typeof vi.fn>;
        select: ReturnType<typeof vi.fn>;
        groupBy: ReturnType<typeof vi.fn>;
        orderBy: ReturnType<typeof vi.fn>;
        limit: ReturnType<typeof vi.fn>;
        offset: ReturnType<typeof vi.fn>;
      };
    }

    let fakeQuery: ReturnType<typeof createFakeQuery>;

    beforeEach(() => {
      fakeQuery = createFakeQuery();
      vi.mocked(actualApi.q).mockReturnValue(fakeQuery as unknown as ReturnType<typeof actualApi.q>);
    });

    it("should build the query from table/filter/select and call aqlQuery", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "runQuery";
        if (name === "resource") return "query";
        if (name === "budgetId") return "test-budget-id";
        if (name === "table") return "transactions";
        if (name === "filter") return '{"amount": {"$lt": 0}}';
        if (name === "select") return '["date", "amount"]';
        if (name === "groupBy") return "[]";
        if (name === "orderBy") return "[]";
        if (name === "rowLimit") return 0;
        if (name === "offset") return 0;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(actualApi.q).toHaveBeenCalledWith("transactions");
      expect(fakeQuery.filter).toHaveBeenCalledWith({ amount: { $lt: 0 } });
      expect(fakeQuery.select).toHaveBeenCalledWith(["date", "amount"]);
      expect(fakeQuery.groupBy).not.toHaveBeenCalled();
      expect(fakeQuery.orderBy).not.toHaveBeenCalled();
      expect(fakeQuery.limit).not.toHaveBeenCalled();
      expect(fakeQuery.offset).not.toHaveBeenCalled();
      expect(actualApi.aqlQuery).toHaveBeenCalledWith(fakeQuery);
    });

    it("should apply groupBy/orderBy/limit/offset when provided", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "runQuery";
        if (name === "resource") return "query";
        if (name === "budgetId") return "test-budget-id";
        if (name === "table") return "transactions";
        if (name === "filter") return "{}";
        if (name === "select") return '"*"';
        if (name === "groupBy") return '["category"]';
        if (name === "orderBy") return '["date"]';
        if (name === "rowLimit") return 10;
        if (name === "offset") return 5;
        return undefined;
      });

      await node.execute.call(executeFunctions);

      expect(fakeQuery.filter).not.toHaveBeenCalled();
      expect(fakeQuery.groupBy).toHaveBeenCalledWith(["category"]);
      expect(fakeQuery.orderBy).toHaveBeenCalledWith(["date"]);
      expect(fakeQuery.limit).toHaveBeenCalledWith(10);
      expect(fakeQuery.offset).toHaveBeenCalledWith(5);
    });

    it("should throw on invalid filter JSON", async () => {
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "runQuery";
        if (name === "resource") return "query";
        if (name === "budgetId") return "test-budget-id";
        if (name === "table") return "transactions";
        if (name === "filter") return "not json";
        if (name === "select") return '"*"';
        if (name === "groupBy") return "[]";
        if (name === "orderBy") return "[]";
        if (name === "rowLimit") return 0;
        if (name === "offset") return 0;
        return undefined;
      });

      await expect(node.execute.call(executeFunctions)).rejects.toThrow(/invalid JSON/);
    });

    it("should return each row as a separate output item when aqlQuery resolves an array", async () => {
      vi.mocked(actualApi.aqlQuery).mockResolvedValueOnce([
        { date: "2024-01-01", amount: -100 },
        { date: "2024-01-02", amount: -200 },
      ]);
      executeFunctions.getNodeParameter.mockImplementation((name: string) => {
        if (name === "operation") return "runQuery";
        if (name === "resource") return "query";
        if (name === "budgetId") return "test-budget-id";
        if (name === "table") return "transactions";
        if (name === "filter") return "{}";
        if (name === "select") return '"*"';
        if (name === "groupBy") return "[]";
        if (name === "orderBy") return "[]";
        if (name === "rowLimit") return 0;
        if (name === "offset") return 0;
        return undefined;
      });

      const result = await node.execute.call(executeFunctions);

      expect(result[0]).toHaveLength(2);
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
          if (name === "resource") return "transaction";
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

      const nodeA = new ActualBudgetV2();
      const nodeB = new ActualBudgetV2();

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
