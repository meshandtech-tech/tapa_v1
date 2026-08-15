import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { HostCommand } from "../party/channel";
import { MAX_CUSTOM_TOPICS, type PartyState } from "../party/types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { cn } from "../ui/cn";

function novoId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `c-${crypto.randomUUID().slice(0, 8)}`
    : `c-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Teses escritas pelo host, no celular dele, antes de começar.
 *
 * A associação a um jogador é OPCIONAL de propósito — a graça costuma ser
 * escrever sobre alguém da roda, mas obrigar um tema por pessoa engessaria.
 */
export function CustomTopics({
  state,
  send,
}: {
  state: PartyState;
  send: (command: HostCommand) => void;
}) {
  const topics = state.devil?.customTopics ?? [];
  const [texto, setTexto] = useState("");
  const [sobre, setSobre] = useState<string>("");
  const [editando, setEditando] = useState<string | null>(null);
  const cheio = topics.length >= MAX_CUSTOM_TOPICS;

  const limpar = () => {
    setTexto("");
    setSobre("");
    setEditando(null);
  };

  const salvar = () => {
    const limpo = texto.trim();
    if (!limpo) return;
    if (editando) {
      send({
        type: "EDIT_CUSTOM_TOPIC",
        id: editando,
        text: limpo,
        aboutPlayerId: sobre || undefined,
      });
    } else {
      send({
        type: "ADD_CUSTOM_TOPIC",
        topic: { id: novoId(), text: limpo, aboutPlayerId: sobre || undefined },
      });
    }
    limpar();
  };

  return (
    <Card tilt="tilt-1" className="flex w-full max-w-md flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl font-bold uppercase">Teses da casa</h3>
        <span className="font-action text-sm uppercase opacity-70">
          {topics.length}/{MAX_CUSTOM_TOPICS}
        </span>
      </div>
      <p className="font-hand text-base leading-snug">
        Opcional. Elas entram na roleta <strong>antes</strong> das do sistema.
      </p>

      <AnimatePresence initial={false}>
        {topics.map((topic) => {
          const alvo = state.players.find((p) => p.id === topic.aboutPlayerId);
          return (
            <motion.div
              key={topic.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-start gap-2 border-4 border-ink bg-paper p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words font-ui text-sm leading-snug">{topic.text}</p>
                {alvo ? (
                  <p className="mt-1 font-action text-xs uppercase text-accent-dark">
                    sobre {alvo.nickname}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Editar"
                onClick={() => {
                  setEditando(topic.id);
                  setTexto(topic.text);
                  setSobre(topic.aboutPlayerId ?? "");
                }}
                className="shrink-0 cursor-pointer border-4 border-ink p-1 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <Pencil strokeWidth={3} className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Excluir"
                onClick={() => send({ type: "REMOVE_CUSTOM_TOPIC", id: topic.id })}
                className="shrink-0 cursor-pointer border-4 border-ink bg-ink p-1 text-paper focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <Trash2 strokeWidth={3} className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {cheio && !editando ? (
        <p className="font-hand text-base opacity-70">
          Chegou no limite de {MAX_CUSTOM_TOPICS}. Apague uma para escrever outra.
        </p>
      ) : (
        <div className="flex flex-col gap-2 border-t-4 border-dashed border-ink pt-4">
          <textarea
            value={texto}
            onChange={(event) => setTexto(event.target.value.slice(0, 140))}
            rows={2}
            placeholder="Defenda que o Samuel cozinha melhor que um chef"
            className={cn(
              "w-full resize-none border-4 border-ink bg-paper p-3 font-ui text-base",
              "focus:outline-4 focus:outline-offset-2 focus:outline-ink",
            )}
          />
          <label className="font-action text-xs uppercase opacity-70" htmlFor="sobre-quem">
            Sobre quem (opcional)
          </label>
          <select
            id="sobre-quem"
            value={sobre}
            onChange={(event) => setSobre(event.target.value)}
            className="w-full cursor-pointer border-4 border-ink bg-paper p-2 font-ui text-base focus:outline-4 focus:outline-offset-2 focus:outline-ink"
          >
            <option value="">Ninguém em especial</option>
            {state.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.nickname}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" variant="solid" className="flex-1" onClick={salvar}>
              <Plus strokeWidth={3} className="size-4" />
              {editando ? "Salvar" : "Adicionar"}
            </Button>
            {editando ? (
              <Button size="sm" variant="paper" onClick={limpar}>
                <X strokeWidth={3} className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
