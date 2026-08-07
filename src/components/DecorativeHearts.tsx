const hearts = [
  { left: "4%", top: "10%", size: "2rem", delay: "0s" },
  { left: "12%", top: "72%", size: "3rem", delay: "-2s" },
  { left: "24%", top: "18%", size: "1.4rem", delay: "-4s" },
  { left: "76%", top: "12%", size: "2.6rem", delay: "-1s" },
  { left: "88%", top: "66%", size: "1.8rem", delay: "-3s" },
  { left: "95%", top: "28%", size: "3.3rem", delay: "-5s" },
] as const;

interface DecorativeHeartsProps {
  celebration?: boolean;
}

export function DecorativeHearts({ celebration = false }: DecorativeHeartsProps) {
  return (
    <div className={`hearts ${celebration ? "hearts--celebration" : ""}`} aria-hidden="true">
      {hearts.map((heart, index) => (
        <span
          className="heart"
          key={`${heart.left}-${heart.top}`}
          style={{
            left: heart.left,
            top: heart.top,
            fontSize: heart.size,
            animationDelay: heart.delay,
          }}
        >
          {index % 3 === 0 ? "♡" : "♥"}
        </span>
      ))}
    </div>
  );
}
