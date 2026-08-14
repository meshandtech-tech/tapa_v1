import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Rede de segurança da festa: qualquer erro de render vira uma tela de
 * recuperação com saída para o início, nunca uma tela branca no meio do jogo.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[tapa] erro não tratado", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-accent px-5 text-center">
        <div className="border-4 border-ink bg-paper p-8 shadow-brutal-lg">
          <h1 className="font-display text-4xl font-bold uppercase">Deu tapa na tela</h1>
          <p className="mt-2 font-hand text-xl">
            Alguma coisa quebrou, mas a festa continua.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign("/");
            }}
            className="mt-5 min-h-14 w-full cursor-pointer border-4 border-ink bg-ink px-6 font-action text-lg uppercase text-paper shadow-brutal active:translate-x-1 active:translate-y-1"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }
}
