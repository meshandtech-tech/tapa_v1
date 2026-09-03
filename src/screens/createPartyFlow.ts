export type RoomCreationStage = "auth" | "room";

/**
 * A query `?game=` só serve para escolher o jogo ao entrar no lobby.
 *
 * Mantê-la na URL durante a partida é normal; reaplicá-la a cada snapshot não
 * é. Além de gastar RPC, o banco corretamente rejeita mudança de jogo fora do
 * lobby e enche o console de erros em pleno jogo.
 */
export function shouldSyncPreselectedGame(
  isHost: boolean,
  phase: string | undefined,
  currentGameId: string | undefined,
  preselectedGameId: string,
): boolean {
  return isHost && phase === "LOBBY" && currentGameId !== preselectedGameId;
}

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
  createCloudRoom: (
    pin: string, gameId: string,
  ) => Promise<{ pin?: string } | null>;
  shouldRetryAfterAuthFailure?: () => boolean;
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
  shouldRetryAfterAuthFailure,
  markLocalOwner,
}: PrepareRoomOptions): Promise<string> {
  if (!cloud) {
    markLocalOwner(pin);
    return pin;
  }

  let userId: string | null;
  try {
    userId = await ensureSession();
  } catch (cause) {
    throw new RoomCreationError("auth", { cause });
  }
  if (!userId) throw new RoomCreationError("auth");

  let room: { pin?: string } | null;
  try {
    room = await createCloudRoom(pin, gameId);
  } catch (cause) {
    throw new RoomCreationError("room", { cause });
  }

  // Uma sessão pode ser revogada entre a confirmação no Auth e o RPC. Um 401
  // garante que nenhuma sala foi criada, então este é o único erro em que
  // renovar a identidade e repetir não corre risco de abrir duas salas.
  if (!room && shouldRetryAfterAuthFailure?.()) {
    let recovered: string | null;
    try {
      recovered = await ensureSession();
    } catch (cause) {
      throw new RoomCreationError("auth", { cause });
    }
    if (!recovered) throw new RoomCreationError("auth");

    try {
      room = await createCloudRoom(pin, gameId);
    } catch (cause) {
      throw new RoomCreationError("room", { cause });
    }
  }
  if (!room) throw new RoomCreationError("room");
  return room.pin ?? pin;
}
