import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActualBudgetV1 } from "../nodes/ActualBudget/v1/ActualBudgetV1.node";
import type { IDataObject, IExecuteFunctions } from "n8n-workflow";

// Regression coverage for CodeRabbit's PR #215 concern: existing saved workflow nodes have
// typeVersion 1 and no "resource" parameter stored. This file proves ActualBudgetV1 keeps
// executing the original flat operation dropdown - getNodeParameter("resource", ...) is
// never called - so those saved nodes keep working unchanged after the v1/v2 split.
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
  ]),
  setBudgetAmount: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

import * as actualApi from "@actual-app/api";

describe("ActualBudgetV1 (frozen pre-refactor behavior)", () => {
  let node: ActualBudgetV1;
  let executeFunctions: IExecuteFunctions;

  beforeEach(() => {
    vi.clearAllMocks();
    node = new ActualBudgetV1();
    executeFunctions = {
      getInputData: vi.fn().mockReturnValue([{ json: {} }]),
      // No "resource" branch here at all - a saved v1 node never has that parameter stored.
      // If ActualBudgetV1 ever called getNodeParameter("resource", ...) without a fallback,
      // this mock returning undefined would surface exactly the failure CodeRabbit flagged.
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

  it("reports itself as version 1 with no resource property", () => {
    expect(node.description.version).toBe(1);
    const propertyNames = node.description.properties.map((p) => p.name);
    expect(propertyNames).not.toContain("resource");
    expect(propertyNames).toContain("operation");
  });

  it("runs importTransactions via the flat operation dropdown, without a resource param", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "importTransactions";
      if (name === "budgetId") return "test-budget-id";
      if (name === "accountId") return "account-abc";
      if (name === "transactions") return [{ date: "2024-01-15", amount: -1000 }];
      return undefined;
    });

    const result = await node.execute.call(executeFunctions);

    expect(actualApi.importTransactions).toHaveBeenCalledWith("account-abc", [
      { date: "2024-01-15", amount: -1000 },
    ]);
    expect(result[0][0].json).toEqual({
      added: ["tx-001"],
      updated: [],
      updatedPreview: [],
      errors: [],
    });
  });

  it("runs getTransactions via the flat operation dropdown", async () => {
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

  it("runs getBudgetMonth via the flat operation dropdown", async () => {
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "getBudgetMonth";
      if (name === "budgetId") return "test-budget-id";
      if (name === "month") return "2024-01";
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.getBudgetMonth).toHaveBeenCalledWith("2024-01");
  });

  it("runs setBudgetAmount via the flat operation dropdown, accepting fractional amounts unchanged", async () => {
    // V1 must stay byte-identical to its pre-refactor behavior, including the absence of
    // the integer-amount validation added to V2 - changing this would alter behavior for
    // already-saved nodes with no opt-in.
    executeFunctions.getNodeParameter.mockImplementation((name: string) => {
      if (name === "operation") return "setBudgetAmount";
      if (name === "budgetId") return "test-budget-id";
      if (name === "month") return "2024-01";
      if (name === "categoryId") return "cat-abc";
      if (name === "amount") return 100.5;
      return undefined;
    });

    await node.execute.call(executeFunctions);

    expect(actualApi.setBudgetAmount).toHaveBeenCalledWith("2024-01", "cat-abc", 100.5);
  });
});
