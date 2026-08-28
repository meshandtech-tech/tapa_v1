/**
 * O diário de bordo da partida.
 *
 * Existe por causa de uma pergunta que não teve resposta na festa: "por quê?".
 * Dez pessoas travadas, e a única informação disponível era o que estava
 * escrito na tela — que, por cima, estava MENTINDO ("desenho enviado" para
 * quem nunca desenhou). Depurar aquilo ao vivo era impossível.
 *
 * A regra aqui é que todo evento carregue o mesmo contexto — partida, jogador,
 * passo, fase, instante — para que uma partida falhada possa ser lida do
 * começo ao fim, em ordem, sem adivinhação. Log solto sem contexto foi
 * exatamente o que não ajudou antes.
 *
 * Não é plataforma de observabilidade: é um anel de 200 eventos na memória da
 * aba, ligado em desenvolvimento ou com `?debug=1`. Em produção normal não
 * custa nada e não aparece.
 */

export type GameEvent =
  // Início da partida
  | "MATCH_INITIALIZATION_STARTED"
  | "MATCH_INITIALIZATION_COMPLETE"
  | "MATCH_INITIALIZATION_FAILED"
  // Passo
  | "STEP_STARTED"
  | "STEP_ADVANCE_REQUESTED"
  | "PLAYER_ASSIGNMENT_FETCHED"
  | "PLAYER_ASSIGNMENT_MISSING"
  | "DRAWING_SUBMITTED"
  | "DRAWING_AUTO_SUBMITTED"
  | "GUESS_SUBMITTED"
  | "UPLOAD_COMPLETE"
  | "UPLOAD_FAILED"
  // Transporte
  | "REALTIME_CONNECTED"
  | "REALTIME_DISCONNECTED"
  | "REALTIME_RECONNECTED"
  | "SNAPSHOT_FETCHED"
  | "RPC_FAILED";

interface Contexto {
  matchId?: string | null;
  playerId?: string | null;
  stepIndex?: number | null;
  gamePhase?: string | null;
}

export interface LoggedEvent extends Contexto {
  event: GameEvent;
  timestamp: number;
  /** Milissegundos desde o evento anterior. É onde a pausa suspeita aparece. */
  sinceLastMs: number;
  detail?: Record<string, unknown>;
}

const TETO = 200;
const anel: LoggedEvent[] = [];
let contexto: Contexto = {};
let ultimoEm = 0;

/**
 * Liga com `?debug=1` na URL, e desliga com `?debug=0`.
 *
 * Fica guardado para sobreviver à navegação: o host abre a sala com `?debug=1`
 * e o painel continua ligado quando a partida começa. Em desenvolvimento vem
 * ligado sozinho.
 */
function resolverDebug(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const parametro = new URLSearchParams(window.location.search).get("debug");
    if (parametro === "1") localStorage.setItem("tapa:debug", "1");
    if (parametro === "0") localStorage.removeItem("tapa:debug");
    return localStorage.getItem("tapa:debug") === "1" || !!import.meta.env.DEV;
  } catch {
    return !!import.meta.env.DEV;
  }
}

let ligado: boolean | null = null;
export function isDebugEnabled(): boolean {
  ligado ??= resolverDebug();
  return ligado;
}

/**
 * O contexto que todo evento seguinte carrega.
 *
 * Chamado quando a foto do servidor chega, para os eventos não precisarem
 * repetir partida/passo/fase em cada chamada — e para nunca discordarem dela.
 */
export function setLogContext(proximo: Contexto): void {
  contexto = { ...contexto, ...proximo };
}

export function logGameEvent(event: GameEvent, detail?: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  const timestamp = Date.now();
  const registro: LoggedEvent = {
    event,
    timestamp,
    sinceLastMs: ultimoEm ? timestamp - ultimoEm : 0,
    ...contexto,
    ...(detail ? { detail } : {}),
  };
  ultimoEm = timestamp;
  anel.push(registro);
  if (anel.length > TETO) anel.shift();
}

/** Os eventos guardados, do mais antigo para o mais novo. */
export function recentGameEvents(): readonly LoggedEvent[] {
  return anel;
}

/**
 * A partida falhada em texto, pronta para colar num relato.
 *
 * É o que faltava depois da festa: em vez de "acho que foi a conexão", uma
 * lista em ordem mostrando o último evento antes de tudo parar.
 */
export function dumpGameEvents(): string {
  return anel
    .map((e) => {
      const t = new Date(e.timestamp).toISOString().slice(11, 23);
      const passo = e.stepIndex ?? "-";
      const extra = e.detail ? ` ${JSON.stringify(e.detail)}` : "";
      return `${t} +${String(e.sinceLastMs).padStart(5)}ms  ${e.event.padEnd(30)} `
        + `match=${(e.matchId ?? "-").slice(0, 8)} player=${(e.playerId ?? "-").slice(0, 8)} `
        + `step=${passo} phase=${e.gamePhase ?? "-"}${extra}`;
    })
    .join("\n");
}
