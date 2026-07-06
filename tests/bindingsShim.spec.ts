import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sep } from "path";

vi.mock("detect-libc", () => ({
  familySync: vi.fn(),
  GLIBC: "glibc",
  MUSL: "musl",
}));

import { familySync } from "detect-libc";
import bindings from "../nodes/ActualBudget/bindingsShim";

// Regression coverage for a production crash: n8n's Community Nodes installer runs
// `npm install --ignore-scripts=true`, so better-sqlite3's own install script (which
// fetches its native binary) never runs, and the real "bindings" package has nothing to
// find. This shim replaces "bindings" entirely (aliased at bundle time, see
// scripts/bundle.mjs) and loads this package's own vendored prebuilt binary directly, so
// it never depends on npm install having built or fetched anything.
describe("bindingsShim", () => {
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

  it("throws on a non-linux platform", () => {
    setPlatform("darwin", "x64");
    vi.mocked(familySync).mockReturnValue("glibc");
    const nativeRequire = vi.fn();

    expect(() => bindings(undefined, nativeRequire)).toThrow(/No prebuilt better-sqlite3 binding/);
    expect(nativeRequire).not.toHaveBeenCalled();
  });

  it("throws on a non-x64 architecture", () => {
    setPlatform("linux", "arm64");
    vi.mocked(familySync).mockReturnValue("glibc");
    const nativeRequire = vi.fn();

    expect(() => bindings(undefined, nativeRequire)).toThrow(/No prebuilt better-sqlite3 binding/);
    expect(nativeRequire).not.toHaveBeenCalled();
  });

  it("throws when the libc family can't be detected", () => {
    vi.mocked(familySync).mockReturnValue(null);
    const nativeRequire = vi.fn();

    expect(() => bindings(undefined, nativeRequire)).toThrow(/Could not detect libc family/);
    expect(nativeRequire).not.toHaveBeenCalled();
  });

  it("requires the vendored glibc binary on a standard linux-x64 host", () => {
    vi.mocked(familySync).mockReturnValue("glibc");
    const nativeRequire = vi.fn().mockReturnValue({ ok: true });

    const result = bindings(undefined, nativeRequire);

    expect(result).toEqual({ ok: true });
    const [requestedPath] = nativeRequire.mock.calls[0];
    expect(String(requestedPath)).toMatch(
      new RegExp(`vendor\\${sep}better-sqlite3\\${sep}linux-x64-glibc\\${sep}better_sqlite3\\.node$`),
    );
  });

  it("requires the vendored musl binary when detect-libc reports musl", () => {
    vi.mocked(familySync).mockReturnValue("musl");
    const nativeRequire = vi.fn().mockReturnValue({ ok: true });

    bindings(undefined, nativeRequire);

    const [requestedPath] = nativeRequire.mock.calls[0];
    expect(String(requestedPath)).toMatch(
      new RegExp(`vendor\\${sep}better-sqlite3\\${sep}linux-x64-musl\\${sep}better_sqlite3\\.node$`),
    );
  });

  it("ignores the name argument better-sqlite3 passes", () => {
    vi.mocked(familySync).mockReturnValue("glibc");
    const nativeRequire = vi.fn().mockReturnValue({ ok: true });

    bindings("better_sqlite3.node", nativeRequire);

    expect(nativeRequire).toHaveBeenCalledTimes(1);
  });
});
