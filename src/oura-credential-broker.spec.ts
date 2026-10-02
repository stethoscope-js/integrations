import {
  OuraCredentialError,
  OuraCredentialStore,
  OuraTokens,
  withOuraAccessToken,
} from "./oura-credential-broker";

const now = new Date("2026-10-02T12:00:00Z");
const current = {
  generation: "g1",
  accessToken: "private-old-access",
  refreshToken: "private-old-refresh",
  expiresAt: new Date(now.getTime() + 10_000).toISOString(),
};
const replacement: OuraTokens = {
  accessToken: "private-new-access",
  refreshToken: "private-new-refresh",
  expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
};

function harness() {
  const events: string[] = [];
  let state = { ...current };
  let fence = "lease-1";
  const store: OuraCredentialStore = {
    withLease: async (accountId, callback) => {
      expect(accountId).toBe("private-account-key");
      events.push("lease");
      return callback({ fence });
    },
    load: async (_accountId, lease) => {
      expect(lease.fence).toBe(fence);
      events.push("load");
      return { ...state };
    },
    replace: async (_accountId, lease, expectedGeneration, next) => {
      events.push("replace");
      if (lease.fence !== fence || state.generation !== expectedGeneration) return false;
      state = { ...next, generation: "g2" };
      return true;
    },
  };
  const refresh = jest.fn(async (token: string) => {
    expect(token).toBe(current.refreshToken);
    events.push("refresh");
    return replacement;
  });
  const read = jest.fn(async (token: string) => {
    events.push("read");
    return token;
  });
  const run = () => withOuraAccessToken("private-account-key", store, refresh, read, now);
  return { events, store, refresh, read, run, setState: (next: typeof current) => (state = next), setFence: (next: string) => (fence = next) };
}

describe("unwired Oura credential broker", () => {
  test("uses a safely unexpired access token without refresh", async () => {
    const h = harness();
    h.setState({ ...current, expiresAt: new Date(now.getTime() + 120_000).toISOString() });
    expect(await h.run()).toBe(current.accessToken);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.events).toEqual(["lease", "load", "read"]);
  });

  test("rotates once and commits before the first read", async () => {
    const h = harness();
    expect(await h.run()).toBe(replacement.accessToken);
    expect(h.events).toEqual(["lease", "load", "refresh", "replace", "read"]);
    expect(h.read).toHaveBeenCalledWith(replacement.accessToken);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["timeout", () => Promise.reject(new Error("private-old-refresh leaked")), "refresh_failed"],
    ["invalid pair", () => Promise.resolve({ ...replacement, refreshToken: "" }), "invalid_replacement"],
  ])("fails closed on %s without data access or token disclosure", async (_name, impl, code) => {
    const h = harness();
    h.refresh.mockImplementation(impl);
    const error = await h.run().catch((caught) => caught);
    expect(error).toBeInstanceOf(OuraCredentialError);
    expect(error).toMatchObject({ code, message: code });
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.read).not.toHaveBeenCalled();
  });

  test("does not read data or replay on persistence failure", async () => {
    const h = harness();
    h.store.replace = async () => { throw new Error("private-new-refresh leaked"); };
    await expect(h.run()).rejects.toMatchObject({ code: "store_failed", message: "store_failed" });
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.read).not.toHaveBeenCalled();
  });

  test("refuses a lost lease or generation conflict without retrying refresh", async () => {
    const h = harness();
    h.store.replace = async () => false;
    await expect(h.run()).rejects.toMatchObject({ code: "stale_generation" });
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.read).not.toHaveBeenCalled();
  });

  test("rejects incomplete or missing stored credentials without an exchange", async () => {
    const h = harness();
    h.setState({ ...current, refreshToken: "" });
    await expect(h.run()).rejects.toMatchObject({ code: "invalid_stored_credential" });
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.read).not.toHaveBeenCalled();
  });

  test("serializes contenders and reloads inside the lease before refreshing", async () => {
    const h = harness();
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let enteredFirst!: () => void;
    const firstEntered = new Promise<void>((resolve) => { enteredFirst = resolve; });
    let queue: Promise<unknown> = Promise.resolve();
    h.store.withLease = (_accountId, callback) => {
      const currentTurn = queue.then(async () => {
        const result = await callback({ fence: "lease-1" });
        enteredFirst();
        await firstMayFinish;
        return result;
      });
      queue = currentTurn.catch(() => undefined);
      return currentTurn;
    };
    const first = h.run();
    await firstEntered;
    const second = h.run();
    releaseFirst();
    expect(await Promise.all([first, second])).toEqual([replacement.accessToken, replacement.accessToken]);
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.events.slice(0, 3)).toEqual(["load", "refresh", "replace"]);
    expect(h.events.filter((event) => event === "load")).toHaveLength(2);
    expect(h.events.filter((event) => event === "read")).toHaveLength(2);
  });

  test("never forwards provider or data errors containing tokens", async () => {
    const h = harness();
    h.setState({ ...current, expiresAt: new Date(now.getTime() + 120_000).toISOString() });
    h.read.mockRejectedValue(new Error("private-old-access leaked"));
    const error = await h.run().catch((caught) => caught);
    expect(error).toBeInstanceOf(OuraCredentialError);
    expect(error.message).toBe("data_failed");
    expect(error.stack).not.toContain(current.accessToken);
  });

  test("rejects invalid expiry and sanitizes lease acquisition failures", async () => {
    const h = harness();
    h.setState({ ...current, expiresAt: "not-a-date" });
    await expect(h.run()).rejects.toMatchObject({ code: "invalid_stored_credential" });
    h.store.withLease = async () => { throw new Error("private-old-refresh leaked"); };
    await expect(h.run()).rejects.toMatchObject({ code: "store_failed", message: "store_failed" });
  });
});
