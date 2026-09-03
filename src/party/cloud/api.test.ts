import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  finalizeDrawingReliable,
  resolveRoom,
  submitContributionReliable,
  submitVote,
} from "./api";

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

describe("entrega confiável do caderno", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.rpc.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("repete uma falha de rede e só confirma depois do ACK", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "NETWORK", message: "Failed to fetch" },
      })
      .mockResolvedValueOnce({
        data: { contribution_id: "page-1" },
        error: null,
      });

    const delivery = submitContributionReliable("room-1", {
      strokes: { v: 2, g: 2048, s: [[0, 28, 0, 10, 10]] },
    });
    await vi.runAllTimersAsync();

    await expect(delivery).resolves.toEqual({ contribution_id: "page-1" });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("repete uma chamada sem resposta sem duplicar a página lógica", async () => {
    mocks.rpc
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({
        data: { contribution_id: "page-1" },
        error: null,
      });

    const delivery = submitContributionReliable("room-1", { text: "girafa" });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(delivery).resolves.toEqual({ contribution_id: "page-1" });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("repete também quando o fetch rejeita em vez de devolver erro", async () => {
    mocks.rpc
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce({
        data: { contribution_id: "page-2" },
        error: null,
      });

    const delivery = submitContributionReliable("room-1", { text: "avião" });
    await vi.runAllTimersAsync();

    await expect(delivery).resolves.toEqual({ contribution_id: "page-2" });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("só finaliza o desenho depois do ACK terminal", async () => {
    mocks.rpc.mockResolvedValue({
      data: { accepted: true, status: "submitted", step_index: 2 },
      error: null,
    });

    await expect(finalizeDrawingReliable(
      "room-1", 2, "123/m1/c1/step-2.webp", "submitted",
    )).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_drawing", {
      p_room: "room-1",
      p_step: 2,
      p_storage_path: "123/m1/c1/step-2.webp",
      p_status: "submitted",
    });
  });

  it("repete a finalização quando a conexão cai", async () => {
    mocks.rpc
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce({
        data: { accepted: true, status: "failed", step_index: 2 },
        error: null,
      });

    const finalization = finalizeDrawingReliable("room-1", 2, null, "failed");
    await vi.runAllTimersAsync();

    await expect(finalization).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("usa a finalização antiga durante a janela de deploy", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "function missing from schema cache" },
      })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(finalizeDrawingReliable(
      "room-1", 2, "123/m1/c1/step-2.webp", "submitted",
    )).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "attach_drawing", {
      p_room: "room-1",
      p_step: 2,
      p_storage_path: "123/m1/c1/step-2.webp",
    });
  });

  it("só conclui o voto depois do ACK autoritativo", async () => {
    mocks.rpc.mockResolvedValue({
      data: { accepted: true, duplicate: false, round: 2 },
      error: null,
    });

    await expect(submitVote("room-1", 4)).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_vote_confirmed", {
      p_room: "room-1", p_rating: 4,
    });
  });

  it("mantém o voto funcionando durante a janela anterior à migration", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "function missing from schema cache" },
      })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(submitVote("room-1", 5)).resolves.toMatchObject({
      accepted: true,
      legacy: true,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "submit_vote", {
      p_room: "room-1", p_rating: 5,
    });
  });
});
