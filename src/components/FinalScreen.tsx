import { useState } from "react";
import type { PlayerId } from "../types/game";

interface FinalScreenProps {
  scores: Record<PlayerId, number>;
  totalQuestions?: number;
}

interface Ranked {
  player: PlayerId;
  score: number;
}

function rank(scores: Record<PlayerId, number>): Ranked[] {
  return Object.entries(scores)
    .map(([player, score]) => ({ player, score }))
    .sort((a, b) => b.score - a.score);
}

/** Todos que empataram no topo. Um só nome significa vitória isolada. */
function winners(ranked: readonly Ranked[]): Ranked[] {
  if (ranked.length === 0) return [];
  const top = ranked[0].score;
  return ranked.filter((entry) => entry.score === top);
}

function getPerformanceMessage(ranked: readonly Ranked[], total: number): string {
  if (ranked.length === 0 || total === 0) return "NINGUÉM JOGOU. QUE FESTA ANIMADA.";
  const best = ranked[0].score / total;
  if (best >= 0.8) return "ALGUÉM AQUI ANDOU ESTUDANDO. SUSPEITO.";
  if (best >= 0.5) return "DEU PRO GASTO. NA PRÓXIMA A ROLETA PEGA GERAL.";
  return "A ROLETA FOI A GRANDE VENCEDORA DA NOITE.";
}

function buildShareMessage(ranked: readonly Ranked[], total: number): string {
  const podium = ranked
    .map((entry, index) => `${index + 1}º ${entry.player} — ${entry.score}/${total}`)
    .join("\n");
  const top = winners(ranked);
  const winnerText = top.length > 1
    ? `Empate entre ${top.map((entry) => entry.player).join(" e ")}`
    : (top[0]?.player ?? "Ninguém");

  return `Resultado oficial no Tapa 🎉\n\n${podium}\n\nVencedor: ${winnerText}\n\nJogue você também: quem erra, paga.`;
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export function FinalScreen({ scores, totalQuestions = 0 }: FinalScreenProps) {
  const [copyStatus, setCopyStatus] = useState("COPIAR RESULTADO");
  const ranked = rank(scores);
  const top = winners(ranked);
  const shareMessage = buildShareMessage(ranked, totalQuestions);
  const resultTitle = top.length > 1
    ? "EMPATE!"
    : `${(top[0]?.player ?? "NINGUÉM").toUpperCase()} VENCEU!`;

  const copyResult = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareMessage);
      else if (!fallbackCopy(shareMessage)) throw new Error("Copy failed");
      setCopyStatus("RESULTADO COPIADO!");
    } catch {
      setCopyStatus("NÃO FOI POSSÍVEL COPIAR");
    }
  };

  return (
    <main className="screen final-screen">
      <div className="final-screen__title">
        <p className="eyebrow">FIM DA DESGRAÇA</p>
        <h1>{resultTitle}</h1>
      </div>
      <section className="final-card">
        {ranked.map((entry) => (
          <div
            className={`final-score ${top.some((item) => item.player === entry.player) ? "final-score--winner" : ""}`}
            key={entry.player}
          >
            <span>{entry.player.toUpperCase()}</span>
            <strong>
              {entry.score}
              <small>/{totalQuestions}</small>
            </strong>
          </div>
        ))}
        <p>{getPerformanceMessage(ranked, totalQuestions)}</p>
      </section>
      <div className="final-actions">
        <a
          className="button button--light"
          href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
          target="_blank"
          rel="noreferrer"
        >
          COMPARTILHAR RESULTADO
        </a>
        <button className="button button--dark" type="button" onClick={copyResult} aria-live="polite">
          {copyStatus}
        </button>
      </div>
    </main>
  );
}
