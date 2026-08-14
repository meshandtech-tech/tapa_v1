import { cn } from "./cn";

type Size = "sm" | "md" | "hero";

const SIZES: Record<Size, string> = {
  sm: "text-3xl",
  md: "text-6xl",
  hero: "text-[clamp(5rem,20vw,16rem)]",
};

/**
 * Wordmark do Tapa. Cada letra recebe uma inclinação própria — o desalinho é
 * o que dá a sensação de carimbo feito à mão em vez de logotipo vetorial.
 */
export function Logo({ size = "md", className }: { size?: Size; className?: string }) {
  const letters = ["T", "A", "P", "A"];
  const rotations = ["-rotate-3", "rotate-2", "-rotate-1", "rotate-3"];

  return (
    <h1
      className={cn(
        "flex items-center justify-center font-display font-extrabold uppercase",
        // text-on-accent (e não text-paper): em cyber-yellow e emerald-green o
        // preset pede tipografia preta, senão o wordmark some no fundo claro.
        "leading-none tracking-tighter text-on-accent select-none",
        SIZES[size],
        className,
      )}
      aria-label="Tapa"
    >
      {letters.map((letter, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            // A sombra é o oposto do texto, senão preto-sobre-preto some.
            "inline-block [text-shadow:6px_6px_0_var(--tapa-on-accent-contrast)]",
            rotations[index],
          )}
        >
          {letter}
        </span>
      ))}
    </h1>
  );
}
