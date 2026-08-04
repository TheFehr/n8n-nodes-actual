import { describe, it, expect, vi } from "vitest";

vi.mock("@actual-app/api", () => ({
  init: vi.fn(),
  downloadBudget: vi.fn(),
  shutdown: vi.fn(),
  importTransactions: vi.fn(),
  getTransactions: vi.fn(),
  getBudgetMonth: vi.fn(),
  setBudgetAmount: vi.fn(),
}));

import { ActualBudget } from "../nodes/ActualBudget/ActualBudget.node";
import { ActualBudgetV1 } from "../nodes/ActualBudget/v1/ActualBudgetV1.node";
import { ActualBudgetV2 } from "../nodes/ActualBudget/v2/ActualBudgetV2.node";

describe("ActualBudget (VersionedNodeType wrapper)", () => {
  it("registers both v1 and v2, defaulting new nodes to v2", () => {
    const node = new ActualBudget();

    expect(node.description.defaultVersion).toBe(2);
    expect(node.nodeVersions[1]).toBeInstanceOf(ActualBudgetV1);
    expect(node.nodeVersions[2]).toBeInstanceOf(ActualBudgetV2);
  });

  it("resolves typeVersion 1 to ActualBudgetV1 (existing saved workflows)", () => {
    const node = new ActualBudget();
    expect(node.getNodeType(1)).toBeInstanceOf(ActualBudgetV1);
  });

  it("resolves typeVersion 2, and no version given, to ActualBudgetV2 (new nodes)", () => {
    const node = new ActualBudget();
    expect(node.getNodeType(2)).toBeInstanceOf(ActualBudgetV2);
    expect(node.getNodeType()).toBeInstanceOf(ActualBudgetV2);
  });
});
