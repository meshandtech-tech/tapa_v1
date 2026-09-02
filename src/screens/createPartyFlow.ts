export type RoomCreationStage = "auth" | "room";

/**
 * Falha conhecida no preparo da sala.
 *
 * Separar as etapas deixa a tela mostrar uma orientação útil sem vazar a
 * mensagem interna do Postgres para quem está jogando.
 */
export class RoomCreationError extends Error {
  constructor(
    public readonly stage: RoomCreationStage,
    options?: ErrorOptions,
  ) {
    super(stage === "auth" ? "anonymous auth failed" : "create room failed", options);
    this.name = "RoomCreationError";
  }
}

interface PrepareRoomOptions {
  pin: string;
  gameId: string;
  cloud: boolean;
  ensureSession: () => Promise<string | null>;
  createCloudRoom: (pin: string, gameId: string) => Promise<unknown | null>;
  markLocalOwner: (pin: string) => void;
}

/**
 * Só confirma a sala quando o transporte escolhido realmente a criou.
 *
 * Antes, a landing ignorava `null` tanto no login quanto no RPC e navegava
 * para `/play/:pin` mesmo assim. O resultado parecia uma sala criada, mas ela
 * não existia no banco e ficava presa em "procurando".
 */
export async function prepareRoom({
  pin,
  gameId,
  cloud,
  ensureSession,
  createCloudRoom,
  markLocalOwner,
}: PrepareRoomOptions): Promise<void> {
  if (!cloud) {
    markLocalOwner(pin);
    return;
  }

  let userId: string | null;
  try {
    userId = await ensureSession();
  } catch (cause) {
    throw new RoomCreationError("auth", { cause });
  }
  if (!userId) throw new RoomCreationError("auth");

  let room: unknown | null;
  try {
    room = await createCloudRoom(pin, gameId);
  } catch (cause) {
    throw new RoomCreationError("room", { cause });
  }
  if (!room) throw new RoomCreationError("room");
}
