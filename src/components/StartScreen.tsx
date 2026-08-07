interface StartScreenProps {
  hasSavedGame: boolean;
  onContinue: () => void;
  onStart: () => void;
}

export function StartScreen({ hasSavedGame, onContinue, onStart }: StartScreenProps) {
  return (
    <main className="screen start-screen">
      <div className="start-screen__badge">O QUIZ DOS NOIVOS</div>
      <p className="eyebrow">DESPEDIDA DE SOLTEIROS</p>
      <h1>
        SAMUEL <span>×</span> LUCAS
      </h1>
      <p className="start-screen__subtitle">
        VOCÊ REALMENTE CONHECE A MULHER COM QUEM VAI CASAR?
      </p>
      <div className="start-screen__actions">
        {hasSavedGame ? (
          <>
            <button className="button button--light" type="button" onClick={onContinue}>
              CONTINUAR PARTIDA
            </button>
            <button className="button button--dark" type="button" onClick={onStart}>
              COMEÇAR NOVAMENTE
            </button>
          </>
        ) : (
          <button className="button button--light button--hero" type="button" onClick={onStart}>
            COMEÇAR
          </button>
        )}
      </div>
    </main>
  );
}
