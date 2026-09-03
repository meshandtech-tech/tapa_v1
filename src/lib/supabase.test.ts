import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  signInAnonymously: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: mocks }),
}));

import { ensureAnonSession } from "./supabase";

function session(id = "old-user", permanent = false) {
  return {
    access_token: "stored-access",
    refresh_token: "stored-refresh",
    user: {
      id,
      is_anonymous: !permanent,
      identities: permanent ? [{ provider: "google" }] : [],
    },
  };
}

describe("ensureAnonSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("renova um token salvo que o servidor já não aceita", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: null }, error: { message: "Invalid JWT" },
    });
    mocks.refreshSession.mockResolvedValue({
      data: { user: { id: "old-user" } }, error: null,
    });

    await expect(ensureAnonSession()).resolves.toBe("old-user");
    expect(mocks.refreshSession).toHaveBeenCalledWith({ refresh_token: "stored-refresh" });
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("troca uma sessão anônima morta por uma nova", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: null }, error: { message: "Invalid JWT" },
    });
    mocks.refreshSession.mockResolvedValue({
      data: { user: null }, error: { message: "Invalid Refresh Token" },
    });
    mocks.signInAnonymously.mockResolvedValue({
      data: { user: { id: "new-user" } }, error: null,
    });

    await expect(ensureAnonSession()).resolves.toBe("new-user");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("nunca substitui silenciosamente uma conta Google", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: session("google-user", true) }, error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: null }, error: { message: "Invalid JWT" },
    });
    mocks.refreshSession.mockResolvedValue({
      data: { user: null }, error: { message: "Invalid Refresh Token" },
    });

    await expect(ensureAnonSession()).resolves.toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("deduplica chamadas simultâneas, mas revalida a próxima tentativa", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "old-user" } }, error: null,
    });

    await expect(Promise.all([ensureAnonSession(), ensureAnonSession()]))
      .resolves.toEqual(["old-user", "old-user"]);
    await expect(ensureAnonSession()).resolves.toBe("old-user");

    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });
});
