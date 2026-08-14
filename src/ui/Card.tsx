import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "plain" | "speech" | "torn" | "dashed";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** Inclinação artesanal. Use tiltByIndex() em listas. */
  tilt?: string;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  plain: "border-4 border-ink shadow-brutal-lg",
  // Balão de fala: o rabicho vem do ::after em .zine-speech (styles.css).
  speech: "border-4 border-ink shadow-brutal zine-speech",
  // Recorte de zine: borda irregular por clip-path, sem sombra (o clip a cortaria).
  torn: "zine-torn border-4 border-ink",
  dashed: "border-4 border-dashed border-ink",
};

export function Card({
  variant = "plain",
  tilt,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={cn("rounded-none bg-paper text-ink", VARIANTS[variant], tilt, className)}
    >
      {children}
    </div>
  );
}

/** Bloco preto maciço com texto branco — pergunta, timer, vencedor da rodada. */
export function Knockout({
  tilt,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tilt?: string; children: ReactNode }) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-none border-4 border-ink bg-ink text-paper",
        "shadow-brutal-paper-lg",
        tilt,
        className,
      )}
    >
      {children}
    </div>
  );
}
