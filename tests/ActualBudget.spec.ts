import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActualBudget } from "../nodes/ActualBudget/ActualBudget.node";
import type { IExecuteFunctions } from "n8n-workflow";

vi.mock("@actual-app/api", () => ({
  init: vi.fn().mockResolvedValue(undefined),
  downloadBudget: vi.fn().mockResolvedValue(undefined),
  importTransactions: vi
    .fn()
    .mockResolvedValue({ added: ["tx-001"], updated: [], updatedPreview: [], errors: [] }),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

import * as actualApi from "@actual-app/api";

describe("ActualBudget", () => {
  let node: ActualBudget;
  let executeFunctions: any;

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
      helpers: {
        returnJsonArray: vi.fn((data: any) =>
          Array.isArray(data) ? data.map((d: any) => ({ json: d })) : [{ json: data }],
        ),
        constructExecutionMetaData: vi.fn((data: any, _meta: any) => data),
      },
    };
  });

  it("should call init with credentials", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -1000 }];
      return undefined;
    });

    await node.execute.call(executeFunctions as unknown as IExecuteFunctions);

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

    await node.execute.call(executeFunctions as unknown as IExecuteFunctions);

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

    await node.execute.call(executeFunctions as unknown as IExecuteFunctions);

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

    await node.execute.call(executeFunctions as unknown as IExecuteFunctions);

    expect(actualApi.shutdown).toHaveBeenCalled();
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

    await expect(
      node.execute.call(executeFunctions as unknown as IExecuteFunctions),
    ).rejects.toThrow("Import failed");

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

    const result = await node.execute.call(executeFunctions as unknown as IExecuteFunctions);

    expect(result).toBeDefined();
    expect(actualApi.shutdown).toHaveBeenCalled();
  });

  it("should call importTransactions once per input item", async () => {
    executeFunctions.getInputData.mockReturnValue([{ json: {} }, { json: {} }, { json: {} }]);
    executeFunctions.getNodeParameter.mockImplementation((name: string, _index: number) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -100 }];
      return undefined;
    });

    await node.execute.call(executeFunctions as unknown as IExecuteFunctions);

    expect(actualApi.importTransactions).toHaveBeenCalledTimes(3);
    // init and downloadBudget are called once, not per item
    expect(actualApi.init).toHaveBeenCalledTimes(1);
    expect(actualApi.downloadBudget).toHaveBeenCalledTimes(1);
  });

  it("should return importTransactions result in output", async () => {
    const importResult = { added: ["tx-1", "tx-2"], updated: [], updatedPreview: [], errors: [] };
    vi.mocked(actualApi.importTransactions).mockResolvedValueOnce(importResult as any);
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "test-account-id";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -500 }];
      return undefined;
    });

    const result = await node.execute.call(executeFunctions as unknown as IExecuteFunctions);

    expect(result[0][0].json).toEqual(importResult);
  });
});
