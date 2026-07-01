import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

vi.mock("detect-libc", () => ({
  familySync: vi.fn(),
  GLIBC: "glibc",
  MUSL: "musl",
}));

import { existsSync, mkdirSync, copyFileSync } from "fs";
import { sep } from "path";
import { familySync } from "detect-libc";
import { ensureNativeBinding } from "../nodes/ActualBudget/ensureNativeBinding";

// Regression coverage for a production crash: n8n's Community Nodes installer runs
// `npm install --ignore-scripts=true`, so better-sqlite3's own install script (which
// fetches its native binary) never runs, and every user hits "Could not locate the
// bindings file" the first time a budget loads. ensureNativeBinding() vendors prebuilt
// binaries and places them where better-sqlite3's `bindings` resolver looks, without
// relying on any install script.
describe("ensureNativeBinding", () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  const setPlatform = (platform: string, arch: string) => {
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    Object.defineProperty(process, "arch", { value: arch, configurable: true });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform("linux", "x64");
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    Object.defineProperty(process, "arch", { value: originalArch, configurable: true });
  });

  it("does nothing on a non-linux platform", () => {
    setPlatform("darwin", "x64");
    vi.mocked(familySync).mockReturnValue("glibc");
    vi.mocked(existsSync).mockReturnValue(true);

    ensureNativeBinding();

    expect(copyFileSync).not.toHaveBeenCalled();
  });

  it("does nothing on a non-x64 architecture", () => {
    setPlatform("linux", "arm64");
    vi.mocked(familySync).mockReturnValue("glibc");
    vi.mocked(existsSync).mockReturnValue(true);

    ensureNativeBinding();

    expect(copyFileSync).not.toHaveBeenCalled();
  });

  it("does nothing when the libc family can't be detected", () => {
    vi.mocked(familySync).mockReturnValue(null);
    vi.mocked(existsSync).mockReturnValue(true);

    ensureNativeBinding();

    expect(copyFileSync).not.toHaveBeenCalled();
  });

  it("does nothing when no vendored binary exists for the detected libc", () => {
    vi.mocked(familySync).mockReturnValue("musl");
    // The vendored-binary existence check is the first existsSync call.
    vi.mocked(existsSync).mockReturnValue(false);

    ensureNativeBinding();

    expect(copyFileSync).not.toHaveBeenCalled();
  });

  it("copies the musl binary to both candidate target paths when neither already exists", () => {
    vi.mocked(familySync).mockReturnValue("musl");
    vi.mocked(existsSync).mockReturnValue(false);
    // First existsSync call checks whether the vendored source binary exists — must be true
    // for this scenario, so make just that one call true and every other one false.
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).includes(`vendor${sep}better-sqlite3`),
    );

    ensureNativeBinding();

    expect(copyFileSync).toHaveBeenCalledTimes(2);
    const [sourcePath] = vi.mocked(copyFileSync).mock.calls[0];
    expect(String(sourcePath)).toMatch(/vendor[/\\]better-sqlite3[/\\]linux-x64-musl[/\\]better_sqlite3\.node$/);

    const targets = vi.mocked(copyFileSync).mock.calls.map(([, dest]) => String(dest));
    expect(targets.every((t) => t.endsWith("build/Release/better_sqlite3.node") || t.endsWith("build\\Release\\better_sqlite3.node"))).toBe(true);
    expect(mkdirSync).toHaveBeenCalledTimes(2);
  });

  it("skips a target that already has a binary in place, without overwriting it", () => {
    vi.mocked(familySync).mockReturnValue("glibc");
    // Pretend the vendored source exists AND both possible targets already exist too.
    vi.mocked(existsSync).mockReturnValue(true);

    ensureNativeBinding();

    expect(copyFileSync).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it("swallows copy errors instead of throwing", () => {
    vi.mocked(familySync).mockReturnValue("glibc");
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).includes(`vendor${sep}better-sqlite3`),
    );
    vi.mocked(copyFileSync).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    expect(() => ensureNativeBinding()).not.toThrow();
  });
});
