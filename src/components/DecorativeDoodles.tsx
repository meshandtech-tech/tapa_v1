// Carinhas desenhadas à mão, no espírito do fanzine. Os asteriscos que estavam
// aqui antes lembravam demais o ícone do Claude Code — nada a ver com o Tapa.
//
// `left` fica entre 8% e 82%: encostadas na borda elas eram cortadas pela
// metade num celular de 390px, e meia carinha só parece sujeira.
const doodles = [
  { left: "8%", top: "10%", size: "2.6rem", delay: "0s", glyph: ":)" },
  { left: "14%", top: "72%", size: "2.6rem", delay: "-2s", glyph: "^_^" },
  { left: "26%", top: "18%", size: "1.8rem", delay: "-4s", glyph: ":D" },
  { left: "70%", top: "12%", size: "2.8rem", delay: "-1s", glyph: ";)" },
  { left: "80%", top: "66%", size: "2.2rem", delay: "-3s", glyph: ":P" },
  { left: "82%", top: "30%", size: "3rem", delay: "-5s", glyph: ":)" },
] as const;

interface DecorativeDoodlesProps {
  celebration?: boolean;
}

/** Rabiscos de fanzine flutuando ao fundo. Puramente decorativo. */
export function DecorativeDoodles({ celebration = false }: DecorativeDoodlesProps) {
  return (
    <div className={`hearts ${celebration ? "hearts--celebration" : ""}`} aria-hidden="true">
      {doodles.map((doodle) => (
        <span
          className="heart"
          key={`${doodle.left}-${doodle.top}`}
          style={{
            left: doodle.left,
            top: doodle.top,
            fontSize: doodle.size,
            animationDelay: doodle.delay,
          }}
        >
          {doodle.glyph}
        </span>
      ))}
    </div>
  );
}
