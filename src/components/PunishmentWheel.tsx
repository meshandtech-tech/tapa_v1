import { useEffect, useRef, useState, type CSSProperties, type TransitionEvent } from "react";
import { punishments } from "../data/punishments";
import { getAvailablePunishmentIndices } from "../lib/punishmentPool";
import { playSound } from "../lib/sounds";

interface PunishmentWheelProps {
  usedPunishmentIndices: readonly number[];
  onComplete: (punishmentIndex: number) => void;
}

function randomInteger(maxExclusive: number): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function PunishmentWheel({ usedPunishmentIndices, onComplete }: PunishmentWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [duration, setDuration] = useState(4600);
  const [spinning, setSpinning] = useState(false);
  const selectedIndex = useRef<number | null>(null);
  const completed = useRef(false);
  const fallbackTimer = useRef<number | null>(null);
  const usedPunishments = new Set(usedPunishmentIndices);
  const availableIndices = getAvailablePunishmentIndices(usedPunishmentIndices);

  useEffect(() => () => {
    if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current);
  }, []);

  const finishSpin = () => {
    if (completed.current || selectedIndex.current === null) return;
    completed.current = true;
    setSpinning(false);
    playSound("punishment");
    onComplete(selectedIndex.current);
  };

  const spin = () => {
    if (spinning) return;
    const result = availableIndices[randomInteger(availableIndices.length)];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spinDuration = reducedMotion ? 80 : 4200 + randomInteger(601);
    const turns = 6 + randomInteger(3);

    selectedIndex.current = result;
    completed.current = false;
    setDuration(spinDuration);
    setSpinning(true);
    playSound("wheel");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => setRotation(turns * 360 - result * 30));
    });
    fallbackTimer.current = window.setTimeout(finishSpin, spinDuration + 250);
  };

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName === "transform") finishSpin();
  };

  const wheelStyle = {
    transform: `rotate(${rotation}deg)`,
    transitionDuration: `${duration}ms`,
  } satisfies CSSProperties;

  return (
    <main className="screen wheel-screen">
      <div className="wheel-screen__copy">
        <p className="eyebrow">RESPOSTA ERRADA. VOCÊ SABE O QUE ISSO SIGNIFICA.</p>
        <h1>ROLETA DA DESGRAMA</h1>
        <p className="wheel-screen__remaining">{availableIndices.length} PRENDAS DISPONÍVEIS</p>
      </div>
      <div className="wheel-stage">
        <div className="wheel-pointer" aria-hidden="true" />
        <div
          className={`wheel ${spinning ? "wheel--spinning" : ""}`}
          style={wheelStyle}
          onTransitionEnd={handleTransitionEnd}
          role="img"
          aria-label={`Roleta com ${availableIndices.length} prendas disponíveis`}
        >
          {punishments.map((_, index) => (
            <div
              className={`wheel-label ${usedPunishments.has(index) ? "wheel-label--used" : ""}`}
              style={{ "--segment": index } as CSSProperties}
              key={index}
            >
              <span>{usedPunishments.has(index) ? "×" : String(index + 1).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
        <div className="wheel-hub" aria-hidden="true">★</div>
      </div>
      <button className="button button--light wheel-button" type="button" onClick={spin} disabled={spinning}>
        {spinning ? "SEGURA ESSA..." : "GIRAR A ROLETA"}
      </button>
    </main>
  );
}
