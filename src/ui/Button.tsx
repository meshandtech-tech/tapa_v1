import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "solid" | "knockout" | "paper" | "ghost";
type Size = "sm" | "md" | "tv";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Inclinação artesanal fixa (-1 a 4). Use tiltByIndex() em listas. */
  tilt?: string;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // Papel branco com tipografia preta — o botão padrão do Tapa.
  paper: "bg-paper text-ink",
  // Bloco preto maciço com texto branco (knockout box).
  knockout: "bg-ink text-paper",
  // Preenchido com o accent do tema; usa on-accent para garantir contraste.
  solid: "bg-accent text-on-accent",
  ghost: "bg-transparent text-ink",
};

/**
 * A sombra pertence à variante, não à base: sobre `bg-ink` uma sombra preta é
 * invisível. Estas classes competem pela mesma propriedade (box-shadow), e o
 * `cn()` só concatena — não resolve conflito — então cada variante declara o
 * conjunto completo dos seus estados.
 */
const INK_SHADOW =
  "shadow-brutal-lg active:shadow-brutal-sm motion-safe:hover:shadow-brutal-xl disabled:shadow-brutal";
const PAPER_SHADOW =
  "shadow-brutal-paper-lg active:shadow-brutal-paper-sm motion-safe:hover:shadow-brutal-paper-xl disabled:shadow-brutal-paper";

const VARIANT_SHADOWS: Record<Variant, string> = {
  paper: INK_SHADOW,
  solid: INK_SHADOW,
  ghost: INK_SHADOW,
  knockout: PAPER_SHADOW,
};

const SIZES: Record<Size, string> = {
  sm: "min-h-11 px-4 text-base",
  md: "min-h-14 px-7 text-xl",
  tv: "min-h-20 px-12 text-3xl",
};

export function Button({
  variant = "paper",
  size = "md",
  tilt,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-none",
        "border-4 border-ink font-action uppercase leading-none tracking-wide",
        "transition-[translate,rotate,box-shadow,background-color] duration-150",
        // O clique "afunda" o botão dentro da própria sombra.
        "active:translate-x-1 active:translate-y-1",
        // Levanta e torce de leve — o botão parece colado à mão, não vetorial.
        "motion-safe:hover:-translate-x-0.5 motion-safe:hover:-translate-y-0.5",
        "motion-safe:hover:-rotate-1",
        "focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "disabled:active:translate-x-0 disabled:active:translate-y-0",
        "motion-safe:disabled:hover:rotate-0",
        VARIANTS[variant],
        VARIANT_SHADOWS[variant],
        SIZES[size],
        tilt,
        className,
      )}
    >
      {children}
    </button>
  );
}
