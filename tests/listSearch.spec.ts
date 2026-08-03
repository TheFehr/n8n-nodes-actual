import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ILoadOptionsFunctions } from "n8n-workflow";

vi.mock("@actual-app/api", () => ({
  init: vi.fn().mockResolvedValue(undefined),
  downloadBudget: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
  getAccounts: vi.fn().mockResolvedValue([
    { id: "acc-1", name: "Checking" },
    { id: "acc-2", name: "Savings" },
  ]),
  getPayees: vi.fn().mockResolvedValue([
    { id: "payee-1", name: "Landlord" },
    { id: "payee-2", name: "Electric Co" },
  ]),
  getCategoryGroups: vi.fn().mockResolvedValue([
    {
      id: "grp-1",
      name: "Food",
      categories: [
        { id: "cat-1", name: "Groceries" },
        { id: "cat-2", name: "Restaurants" },
      ],
    },
    { id: "grp-2", name: "Bills", categories: [{ id: "cat-3", name: "Electricity" }] },
  ]),
}));

import { searchAccounts, searchPayees, searchCategories, searchCategoryGroups } from "../nodes/ActualBudget/methods/listSearch";

function makeLoadOptionsContext(budgetId: string): ILoadOptionsFunctions {
  return {
    getCredentials: vi.fn().mockResolvedValue({ url: "http://localhost:5006", password: "test-password" }),
    getNodeParameter: vi.fn().mockReturnValue(budgetId),
  } as unknown as ILoadOptionsFunctions;
}

describe("listSearch methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searchAccounts returns all accounts mapped to name/value when no filter given", async () => {
    const result = await searchAccounts.call(makeLoadOptionsContext("budget-1"));
    expect(result.results).toEqual([
      { name: "Checking", value: "acc-1" },
      { name: "Savings", value: "acc-2" },
    ]);
  });

  it("searchAccounts filters case-insensitively by name", async () => {
    const result = await searchAccounts.call(makeLoadOptionsContext("budget-1"), "check");
    expect(result.results).toEqual([{ name: "Checking", value: "acc-1" }]);
  });

  it("searchPayees returns all payees mapped to name/value", async () => {
    const result = await searchPayees.call(makeLoadOptionsContext("budget-1"));
    expect(result.results).toEqual([
      { name: "Landlord", value: "payee-1" },
      { name: "Electric Co", value: "payee-2" },
    ]);
  });

  it("searchCategoryGroups returns all groups mapped to name/value", async () => {
    const result = await searchCategoryGroups.call(makeLoadOptionsContext("budget-1"));
    expect(result.results).toEqual([
      { name: "Food", value: "grp-1" },
      { name: "Bills", value: "grp-2" },
    ]);
  });

  it("searchCategories flattens categories under their group name and filters by category name", async () => {
    const result = await searchCategories.call(makeLoadOptionsContext("budget-1"), "grocer");
    expect(result.results).toEqual([{ name: "Food / Groceries", value: "cat-1" }]);
  });
});
