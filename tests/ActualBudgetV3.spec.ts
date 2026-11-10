import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from "n8n-workflow";
import { NodeOperationError } from "n8n-workflow";

vi.mock("@actual-app/api", () => ({
  init: vi.fn().mockResolvedValue(undefined),
  downloadBudget: vi.fn().mockResolvedValue(undefined),
  importTransactions: vi
    .fn()
    .mockResolvedValue({ added: [], updated: [], updatedPreview: [], errors: [] }),
  getTransactions: vi.fn().mockResolvedValue([]),
  getAccounts: vi.fn().mockResolvedValue([{ id: "acc-1", name: "Checking" }]),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

import * as actualApi from "@actual-app/api";
import { ActualBudgetApi } from "../credentials/ActualBudgetApi.credentials";
import { ActualBudgetV2 } from "../nodes/ActualBudget/v2/ActualBudgetV2.node";
import { ActualBudgetV3 } from "../nodes/ActualBudget/v3/ActualBudgetV3.node";

const helpers = {
  returnJsonArray: (data: unknown) =>
    Array.isArray(data)
      ? data.map((d) => ({ json: d as IDataObject }))
      : [{ json: data as IDataObject }],
  constructExecutionMetaData: (data: unknown) => data,
};

const baseCreds = { url: "http://localhost:5006", password: "server-pw" };

function makeExecute(
  creds: Record<string, unknown>,
  items = 1,
  extra: Record<string, unknown> = {},
) {
  return {
    getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
    getNodeParameter: (name: string) =>
      ({
        resource: "transaction",
        operation: "getTransactions",
        accountId: "acc-1",
        startDate: "2024-01-01",
        endDate: "2024-01-31",
        ...extra,
      })[name],
    getNode: () => ({ name: "ActualBudget" }),
    getCredentials: async () => creds,
    continueOnFail: () => false,
    helpers,
  } as unknown as IExecuteFunctions;
}

describe("credential budgetId", () => {
  it("has an optional budgetId field (V1/V2 still take the ID from the node)", () => {
    const field = new ActualBudgetApi().properties.find((p) => p.name === "budgetId");
    expect(field).toBeDefined();
    expect(field!.required).toBeFalsy();
  });
});

describe("ActualBudgetV3 description", () => {
  const v2 = new ActualBudgetV2().description;
  const v3 = new ActualBudgetV3().description;

  it("is version 3 and keeps the same node name", () => {
    expect(v3.version).toBe(3);
    expect(v3.name).toBe(v2.name);
  });

  it("has no budgetId node parameter, but is otherwise identical to V2", () => {
    expect(v3.properties.some((p) => p.name === "budgetId")).toBe(false);
    expect(v3.properties.map((p) => p.name)).toEqual(
      v2.properties.filter((p) => p.name !== "budgetId").map((p) => p.name),
    );
  });
});

describe("ActualBudgetV3 execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("downloads the budget named in the credential, with its encryption password", async () => {
    await new ActualBudgetV3().execute.call(
      makeExecute({ ...baseCreds, budgetId: "budget-enc", encryptionPassword: "e2e-pw" }),
    );
    expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-enc", { password: "e2e-pw" });
  });

  it("uses the plain downloadBudget call for a credential without an encryption password", async () => {
    await new ActualBudgetV3().execute.call(
      makeExecute({ ...baseCreds, budgetId: "budget-plain" }),
    );
    expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-plain");
  });

  it("downloads once for multiple items", async () => {
    await new ActualBudgetV3().execute.call(
      makeExecute({ ...baseCreds, budgetId: "budget-plain" }, 3),
    );
    expect(actualApi.downloadBudget).toHaveBeenCalledTimes(1);
  });

  it("ignores any node-level budgetId and uses the credential's", async () => {
    await new ActualBudgetV3().execute.call(
      makeExecute({ ...baseCreds, budgetId: "from-credential" }, 1, { budgetId: "from-node" }),
    );
    expect(actualApi.downloadBudget).toHaveBeenCalledWith("from-credential");
  });

  it("throws a clear NodeOperationError when the credential has no budgetId, before any network call", async () => {
    const err = await new ActualBudgetV3().execute
      .call(makeExecute({ ...baseCreds, budgetId: "  " }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(NodeOperationError);
    expect(err.message).toMatch(/budget id/i);
    expect(actualApi.init).not.toHaveBeenCalled();
  });

  it("V2 is unchanged: it still takes the budget from the node, not the credential", async () => {
    await new ActualBudgetV2().execute.call(
      makeExecute({ ...baseCreds, budgetId: "from-credential" }, 1, { budgetId: "from-node" }),
    );
    expect(actualApi.downloadBudget).toHaveBeenCalledWith("from-node");
  });
});

describe("ActualBudgetV3 listSearch", () => {
  beforeEach(() => vi.clearAllMocks());

  function loadCtx(creds: Record<string, unknown>) {
    return {
      getCredentials: vi.fn().mockResolvedValue(creds),
      getNode: () => ({ name: "ActualBudget" }),
      getNodeParameter: vi.fn().mockReturnValue("from-node"),
    } as unknown as ILoadOptionsFunctions;
  }

  it("lists accounts of the credential's budget, with its encryption password", async () => {
    const v3 = new ActualBudgetV3();
    const res = await v3.methods.listSearch.searchAccounts.call(
      loadCtx({ ...baseCreds, budgetId: "budget-enc", encryptionPassword: "e2e-pw" }),
    );
    expect(res.results).toEqual([{ name: "Checking", value: "acc-1" }]);
    expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-enc", { password: "e2e-pw" });
  });

  it("errors clearly when the credential has no budgetId", async () => {
    const v3 = new ActualBudgetV3();
    await expect(
      v3.methods.listSearch.searchAccounts.call(loadCtx({ ...baseCreds })),
    ).rejects.toThrow(/budget id/i);
  });
});
