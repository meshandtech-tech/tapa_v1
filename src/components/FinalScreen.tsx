import { useState } from "react";
import type { PlayerId } from "../types/game";

interface FinalScreenProps {
  scores: Record<PlayerId, number>;
}

function getWinner(scores: Record<PlayerId, number>): PlayerId | "Empate" {
  if (scores.Lucas === scores.Samuel) return "Empate";
  return scores.Lucas > scores.Samuel ? "Lucas" : "Samuel";
}

function getPerformanceMessage(scores: Record<PlayerId, number>): string {
  const total = scores.Lucas + scores.Samuel;
  if (total >= 16) return "VOCÊS CONHECEM AS MULHERES COM QUEM VÃO CASAR. MILAGRE.";
  if (total >= 10) return "DÁ TEMPO DE ESTUDAR MAIS ANTES DO CASAMENTO.";
  return "VOCÊS TÊM CERTEZA QUE VÃO CASAR COM ESSAS MULHERES?";
}

function buildShareMessage(scores: Record<PlayerId, number>): string {
  const winner = getWinner(scores);
  const winnerText = winner === "Empate" ? "Empate" : winner;
  return `Resultado oficial da Despedida de Solteiros 😂❤️\n\nLucas acertou ${scores.Lucas} de 10 perguntas sobre sua noiva.\n\nSamuel acertou ${scores.Samuel} de 10 perguntas sobre sua noiva.\n\nVencedor: ${winnerText}\n\nDescobrimos hoje quem realmente conhece a mulher com quem vai casar 😂`;
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

export function FinalScreen({ scores }: FinalScreenProps) {
  const [copyStatus, setCopyStatus] = useState("COPIAR RESULTADO");
  const winner = getWinner(scores);
  const shareMessage = buildShareMessage(scores);
  const resultTitle = winner === "Empate" ? "EMPATE!" : `${winner.toUpperCase()} VENCEU!`;

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
        <div className={`final-score ${winner === "Lucas" ? "final-score--winner" : ""}`}>
          <span>LUCAS</span><strong>{scores.Lucas}<small>/10</small></strong>
        </div>
        <span className="final-card__versus">×</span>
        <div className={`final-score ${winner === "Samuel" ? "final-score--winner" : ""}`}>
          <span>SAMUEL</span><strong>{scores.Samuel}<small>/10</small></strong>
        </div>
        <p>{getPerformanceMessage(scores)}</p>
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
