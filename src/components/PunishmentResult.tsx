interface PunishmentResultProps {
  punishment: string;
  onContinue: () => void;
}

export function PunishmentResult({ punishment, onContinue }: PunishmentResultProps) {
  const isLongPunishment = punishment.length > 45;

  return (
    <main className="screen punishment-screen">
      <article className={`punishment-card ${isLongPunishment ? "punishment-card--long" : ""}`}>
        <p className="eyebrow eyebrow--dark">SUA PRENDA</p>
        <span className="punishment-card__heart" aria-hidden="true">♥</span>
        <h1>{punishment}</h1>
        <p>SEM CHORAR. TODO MUNDO ESTÁ VENDO.</p>
        <button className="button button--red" type="button" onClick={onContinue}>
          CUMPRI, CONTINUAR
        </button>
      </article>
    </main>
  );
}
