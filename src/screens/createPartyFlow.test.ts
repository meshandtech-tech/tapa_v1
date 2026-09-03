import { describe, expect, it, vi } from "vitest";
import { prepareRoom, RoomCreationError } from "./createPartyFlow";

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
