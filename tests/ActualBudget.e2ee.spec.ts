import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from "n8n-workflow";
import { ActualBudgetV1 } from "../nodes/ActualBudget/v1/ActualBudgetV1.node";
import { ActualBudgetV2 } from "../nodes/ActualBudget/v2/ActualBudgetV2.node";
import { ActualBudgetApi } from "../credentials/ActualBudgetApi.credentials";
import { searchAccounts } from "../nodes/ActualBudget/v2/methods/listSearch";

// Issue #448: budgets with end-to-end encryption fail with "File ... is encrypted. Please
// provide a password" because the node never passes the E2E password to downloadBudget.
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

const helpers = {
  returnJsonArray: (data: unknown) =>
    Array.isArray(data)
      ? data.map((d) => ({ json: d as IDataObject }))
      : [{ json: data as IDataObject }],
  constructExecutionMetaData: (data: unknown) => data,
};

function makeExecute(creds: Record<string, unknown>, version: 1 | 2) {
  return {
    getInputData: () => [{ json: {} }],
    getNodeParameter: (name: string) => {
      if (name === "operation") return "getTransactions";
      if (name === "resource") return version === 2 ? "transaction" : undefined;
      if (name === "budgetId") return "budget-1";
      if (name === "accountId") return "acc-1";
      if (name === "startDate") return "2024-01-01";
      if (name === "endDate") return "2024-01-31";
      return undefined;
    },
    getNode: () => ({ name: "ActualBudget" }),
    getCredentials: async () => creds,
    continueOnFail: () => false,
    helpers,
  } as unknown as IExecuteFunctions;
}

const base = { url: "http://localhost:5006", password: "server-pw" };

describe("end-to-end encrypted budgets (#448)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("credentials expose an optional password-type encryptionPassword field", () => {
    const field = new ActualBudgetApi().properties.find((p) => p.name === "encryptionPassword");
    expect(field).toBeDefined();
    expect(field!.typeOptions).toMatchObject({ password: true });
    expect(field!.required).toBeFalsy();
  });

  for (const version of [1, 2] as const) {
    const Node = version === 1 ? ActualBudgetV1 : ActualBudgetV2;

    it(`V${version} passes the encryption password to downloadBudget`, async () => {
      await new Node().execute.call(
        makeExecute({ ...base, encryptionPassword: "e2e-pw" }, version),
      );
      expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-1", { password: "e2e-pw" });
    });

    it(`V${version} keeps the plain downloadBudget call when no encryption password is set`, async () => {
      await new Node().execute.call(makeExecute({ ...base, encryptionPassword: "" }, version));
      expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-1");
      await new Node().execute.call(makeExecute(base, version));
      expect(actualApi.downloadBudget).toHaveBeenLastCalledWith("budget-1");
    });
  }

  it("listSearch (account dropdown) passes the encryption password too", async () => {
    const ctx = {
      getCredentials: vi.fn().mockResolvedValue({ ...base, encryptionPassword: "e2e-pw" }),
      getNodeParameter: vi.fn().mockReturnValue("budget-1"),
    } as unknown as ILoadOptionsFunctions;
    await searchAccounts.call(ctx);
    expect(actualApi.downloadBudget).toHaveBeenCalledWith("budget-1", { password: "e2e-pw" });
  });
});
