import { Check, Users } from "lucide-react";
import { GAMES, type GameId } from "./registry";
import { cn } from "../ui/cn";

/**
 * Escolha do jogo, no celular do host.
 *
 * Cada opção usa a COR e o ÍCONE do próprio jogo, em cartão grande. A versão
 * anterior era uma lista de botões quase idênticos, e escolher entre eles não
 * parecia escolher entre experiências diferentes — parecia preencher um
 * formulário. A identidade de cada jogo já existia no registry; faltava usá-la
 * no momento em que a decisão acontece.
 */
export function GamePicker({
  selected,
  onSelect,
  className,
}: {
  selected: GameId;
  onSelect: (gameId: GameId) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {GAMES.map((game) => {
        const Icon = game.icon;
        const ativo = game.id === selected;
        const embreve = !!game.comingSoon;
        return (
          <button
            key={game.id}
            type="button"
            disabled={embreve}
            onClick={() => onSelect(game.id)}
            aria-pressed={ativo}
            className={cn(
              "relative flex w-full cursor-pointer flex-col gap-1 border-4 border-ink p-4 text-left",
              "transition-transform focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink",
              "disabled:cursor-not-allowed disabled:opacity-40",
              ativo ? "shadow-brutal-lg" : "shadow-brutal motion-safe:hover:-translate-y-0.5",
            )}
            // A cor do jogo pinta o cartão inteiro quando escolhido.
            style={
              ativo
                ? { backgroundColor: game.identity.accent, color: game.identity.onAccent }
                : { backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }
            }
          >
            <div className="flex items-center gap-3">
              <span
                className="grid size-11 shrink-0 place-items-center self-start border-4 border-ink"
                style={{
                  backgroundColor: ativo ? game.identity.onAccent : game.identity.accent,
                  color: ativo ? game.identity.accent : game.identity.onAccent,
                }}
              >
                <Icon strokeWidth={2.5} className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                {/* Sem truncar: "Quem Erra, Paga" não cabe numa linha de 390px
                    e o nome do jogo é a informação principal do cartão. */}
                <span className="block font-display text-lg font-extrabold uppercase leading-tight">
                  {game.title}
                </span>
                <span className="block font-action text-xs uppercase opacity-80">
                  {game.tagline}
                </span>
              </span>
              {ativo ? <Check strokeWidth={3} className="size-5 shrink-0 self-start" /> : null}
            </div>

            <p className="font-ui text-sm leading-snug opacity-90">{game.description}</p>

            <p className="flex items-center gap-1.5 font-hand text-sm opacity-80">
              <Users strokeWidth={2.5} className="size-4" />
              {game.minPlayers}–{game.maxPlayers} jogadores
              {embreve ? " · em breve" : ""}
            </p>
          </button>
        );
      })}
    </div>
  );
}
