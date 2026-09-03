import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return {
    rpc: vi.fn(),
    from: vi.fn(() => query),
    query,
  };
});

vi.mock("../../lib/supabase", () => ({
  getSupabase: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

vi.mock("../telemetry", () => ({ logGameEvent: vi.fn() }));

import { resolveRoom } from "./api";

describe("resolveRoom durante o deploy compatível", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockClear();
    mocks.query.maybeSingle.mockReset();
  });

  it("usa a RPC protegida quando a migration já existe", async () => {
    mocks.rpc.mockResolvedValue({ data: "room-new", error: null });

    await expect(resolveRoom("1234")).resolves.toBe("room-new");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("mantém a entrada funcionando antes da migration 0014", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function missing from schema cache" },
    });
    mocks.query.maybeSingle.mockResolvedValue({
      data: { id: "room-old" }, error: null,
    });

    await expect(resolveRoom("1234")).resolves.toBe("room-old");
    expect(mocks.from).toHaveBeenCalledWith("rooms");
  });
});
