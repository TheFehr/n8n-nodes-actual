import { describe, it, expect, vi } from "vitest";
import { ActualBudgetV1 } from "../nodes/ActualBudget/v1/ActualBudgetV1.node";
import { ActualBudgetV2 } from "../nodes/ActualBudget/v2/ActualBudgetV2.node";
import type { IDataObject, IExecuteFunctions } from "n8n-workflow";

// Regression test: ActualBudgetV1 and ActualBudgetV2 are separate classes but both drive
// the same @actual-app/api module-level session singleton. Before this fix, each version
// had its own private runExclusive queue, so a V1 execution and a V2 execution running
// concurrently (e.g. two different workflows, one still on a saved typeVersion-1 node)
// could race - one's init()/shutdown() tearing down state the other was mid-operation on.
// They must now share a single queue (nodes/ActualBudget/executionQueue.ts).
vi.mock("@actual-app/api", () => ({
  init: vi.fn().mockResolvedValue(undefined),
  downloadBudget: vi.fn().mockResolvedValue(undefined),
  importTransactions: vi
    .fn()
    .mockResolvedValue({ added: [], updated: [], updatedPreview: [], errors: [] }),
  getTransactions: vi.fn().mockResolvedValue([]),
  getBudgetMonth: vi.fn().mockResolvedValue({}),
  setBudgetAmount: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

import * as actualApi from "@actual-app/api";

describe("ActualBudgetV1 / ActualBudgetV2 cross-version concurrency", () => {
  const makeExecuteFunctions = (resource: "v1" | "transaction", budgetId: string, accountId: string) =>
    ({
      getInputData: () => [{ json: {} }],
      getNodeParameter: (name: string) => {
        if (name === "operation") return "importTransactions";
        if (name === "resource" && resource === "transaction") return "transaction";
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

  it("does not let a V2 execution start init/downloadBudget until a concurrent V1 execution has fully shut down", async () => {
    const callOrder: string[] = [];
    let releaseV1Import: () => void = () => {};
    const v1ImportGate = new Promise<void>((resolve) => {
      releaseV1Import = resolve;
    });

    vi.mocked(actualApi.init).mockImplementation(async () => {
      callOrder.push("init");
    });
    vi.mocked(actualApi.downloadBudget).mockImplementation(async (id: string) => {
      callOrder.push(`downloadBudget:${id}`);
    });
    vi.mocked(actualApi.importTransactions).mockImplementation(async (accountId: string) => {
      callOrder.push(`importTransactions:${accountId}`);
      if (accountId === "account-V1") {
        await v1ImportGate;
      }
      return { added: [], updated: [], updatedPreview: [], errors: [] };
    });
    vi.mocked(actualApi.shutdown).mockImplementation(async () => {
      callOrder.push("shutdown");
    });

    const v1 = new ActualBudgetV1();
    const v2 = new ActualBudgetV2();

    const execV1 = v1.execute.call(makeExecuteFunctions("v1", "budget-V1", "account-V1"));
    await vi.waitFor(() => expect(callOrder).toContain("importTransactions:account-V1"));

    // v2's execute() is chained behind v1's the instant it's called (runExclusive appends
    // to the shared queue synchronously), so it cannot reach downloadBudget before v1's
    // gated importTransactions is released - the callOrder assertion below proves that.
    const execV2 = v2.execute.call(makeExecuteFunctions("transaction", "budget-V2", "account-V2"));

    releaseV1Import();
    await Promise.all([execV1, execV2]);

    expect(callOrder).toEqual([
      "init",
      "downloadBudget:budget-V1",
      "importTransactions:account-V1",
      "shutdown",
      "init",
      "downloadBudget:budget-V2",
      "importTransactions:account-V2",
      "shutdown",
    ]);
  });
});
