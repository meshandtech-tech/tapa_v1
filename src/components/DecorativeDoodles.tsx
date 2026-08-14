const doodles = [
  { left: "4%", top: "10%", size: "2.4rem", delay: "0s", glyph: "★" },
  { left: "12%", top: "72%", size: "3rem", delay: "-2s", glyph: "✳" },
  { left: "24%", top: "18%", size: "1.6rem", delay: "-4s", glyph: "✚" },
  { left: "76%", top: "12%", size: "2.8rem", delay: "-1s", glyph: "✦" },
  { left: "88%", top: "66%", size: "2rem", delay: "-3s", glyph: "✳" },
  { left: "95%", top: "28%", size: "3.4rem", delay: "-5s", glyph: "★" },
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
