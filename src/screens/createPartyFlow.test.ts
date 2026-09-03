import { describe, expect, it, vi } from "vitest";
import { prepareRoom, RoomCreationError, shouldSyncPreselectedGame } from "./createPartyFlow";

const base = {
  pin: "1234",
  gameId: "quem-erra-paga",
  ensureSession: vi.fn(async () => "user-1" as string | null),
  createCloudRoom: vi.fn(async () => ({ pin: "1234" }) as { pin: string } | null),
  markLocalOwner: vi.fn(),
};

describe("prepareRoom", () => {
  it("confirma a sala da nuvem somente depois de autenticar e criar no banco", async () => {
    const ensureSession = vi.fn(async () => "user-1");
    const createCloudRoom = vi.fn(async () => ({ pin: "1234" }));

    await expect(prepareRoom({
      ...base, cloud: true, ensureSession, createCloudRoom,
    })).resolves.toBe("1234");

    expect(ensureSession).toHaveBeenCalledOnce();
    expect(createCloudRoom).toHaveBeenCalledWith("1234", "quem-erra-paga");
    expect(base.markLocalOwner).not.toHaveBeenCalled();
  });

  it("interrompe antes do RPC quando a sessão anônima falha", async () => {
    const createCloudRoom = vi.fn(async () => ({ pin: "1234" }));

    await expect(prepareRoom({
      ...base,
      cloud: true,
      ensureSession: vi.fn(async () => null),
      createCloudRoom,
    })).rejects.toMatchObject({ stage: "auth" } satisfies Partial<RoomCreationError>);

    expect(createCloudRoom).not.toHaveBeenCalled();
  });

  it("não confirma uma sala quando create_room devolve null", async () => {
    await expect(prepareRoom({
      ...base,
      cloud: true,
      createCloudRoom: vi.fn(async () => null),
    })).rejects.toMatchObject({ stage: "room" } satisfies Partial<RoomCreationError>);
  });

  it("renova a sessão e repete somente quando o RPC recusou a autenticação", async () => {
    const ensureSession = vi.fn(async () => "user-1");
    const createCloudRoom = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ pin: "1234" });

    await expect(prepareRoom({
      ...base,
      cloud: true,
      ensureSession,
      createCloudRoom,
      shouldRetryAfterAuthFailure: () => true,
    })).resolves.toBe("1234");

    expect(ensureSession).toHaveBeenCalledTimes(2);
    expect(createCloudRoom).toHaveBeenCalledTimes(2);
  });

  it("não repete create_room em falha comum para não abrir duas salas", async () => {
    const createCloudRoom = vi.fn(async () => null);

    await expect(prepareRoom({
      ...base,
      cloud: true,
      createCloudRoom,
      shouldRetryAfterAuthFailure: () => false,
    })).rejects.toMatchObject({ stage: "room" } satisfies Partial<RoomCreationError>);

    expect(createCloudRoom).toHaveBeenCalledOnce();
  });

  it("preserva o caminho local quando o Supabase não está configurado", async () => {
    const markLocalOwner = vi.fn();
    const ensureSession = vi.fn(async () => "user-1");
    const createCloudRoom = vi.fn(async () => ({ pin: "1234" }));

    await expect(prepareRoom({
      ...base,
      cloud: false,
      markLocalOwner,
      ensureSession,
      createCloudRoom,
    })).resolves.toBe("1234");

    expect(markLocalOwner).toHaveBeenCalledWith("1234");
    expect(ensureSession).not.toHaveBeenCalled();
    expect(createCloudRoom).not.toHaveBeenCalled();
  });

  it("usa o PIN confirmado pelo banco quando houve colisão", async () => {
    await expect(prepareRoom({
      ...base,
      cloud: true,
      createCloudRoom: vi.fn(async () => ({ pin: "9876" })),
    })).resolves.toBe("9876");
  });
});

describe("shouldSyncPreselectedGame", () => {
  it("sincroniza apenas o host no lobby quando a escolha ainda é diferente", () => {
    expect(shouldSyncPreselectedGame(true, "LOBBY", "quem-erra-paga", "improv-slides"))
      .toBe(true);
  });

  it("não reenvia a escolha que a sala já possui", () => {
    expect(shouldSyncPreselectedGame(true, "LOBBY", "improv-slides", "improv-slides"))
      .toBe(false);
  });

  it("nunca tenta mudar o jogo durante uma partida", () => {
    expect(shouldSyncPreselectedGame(true, "PRESENTATION", "quem-erra-paga", "improv-slides"))
      .toBe(false);
  });

  it("convidado não aplica configuração de host", () => {
    expect(shouldSyncPreselectedGame(false, "LOBBY", "quem-erra-paga", "improv-slides"))
      .toBe(false);
  });
});
