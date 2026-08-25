import { useCallback, useEffect, useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { hasPermanentAccount, isSupabaseConfigured, linkGoogleAccount } from "../lib/supabase";
import { ageFromBirthYear, fetchMyProfile, saveMyProfile, MIN_AGE, type Profile } from "../party/cloud/profile";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/**
 * Conta do host — OPCIONAL.
 *
 * Fica fora do caminho de criar sala de propósito. O atrito zero na entrada é
 * a melhor qualidade do produto: nove pessoas numa mesa de bar escaneiam um QR
 * e jogam. Pedir login ali mataria a festa antes de começar.
 *
 * Quem entra continua anônimo para sempre. Só quem CRIA a sala tem motivo para
 * ter conta — e mesmo assim, só se quiser.
 */
export function HostAccountCard() {
  const [perfil, setPerfil] = useState<Profile | null>(null);
  const [logado, setLogado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [nickname, setNickname] = useState("");
  const [anoNascimento, setAnoNascimento] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const permanente = await hasPermanentAccount();
    setLogado(permanente);
    if (permanente) {
      const dados = await fetchMyProfile();
      setPerfil(dados);
      setNickname(dados?.nickname ?? "");
      setAnoNascimento(dados?.birth_year ? String(dados.birth_year) : "");
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setCarregando(false);
      return;
    }
    void recarregar();
  }, [recarregar]);

  const entrar = async () => {
    setErro(null);
    const { error } = await linkGoogleAccount();
    if (error) setErro(error);
  };

  const salvar = async () => {
    setErro(null);
    const ano = anoNascimento ? Number(anoNascimento) : undefined;

    if (ano !== undefined) {
      const idade = ageFromBirthYear(ano);
      if (!Number.isInteger(ano) || idade === null || idade < 0 || idade > 120) {
        setErro("Ano de nascimento inválido.");
        return;
      }
      // A landing diz 16+. Avisar aqui é mais honesto do que aceitar e depois
      // descobrir; o cadastro simplesmente não acontece.
      if (idade < MIN_AGE) {
        setErro(`O Tapa é ${MIN_AGE}+.`);
        return;
      }
    }

    setSalvando(true);
    const salvo = await saveMyProfile({ nickname: nickname.trim(), birthYear: ano });
    setPerfil(salvo);
    setSalvando(false);
  };

  // Sem backend não há conta nenhuma para oferecer.
  if (!isSupabaseConfigured || carregando) return null;

  if (!logado) {
    return (
      <Card variant="dashed" className="w-full max-w-md p-4 text-center">
        <p className="font-hand text-lg">
          Quer guardar suas festas e seu apelido entre uma sala e outra?
        </p>
        <Button size="sm" variant="paper" className="mt-3 w-full" onClick={() => void entrar()}>
          <LogIn strokeWidth={3} className="size-5" />
          Entrar com Google
        </Button>
        <p className="mt-2 font-action text-[0.6rem] uppercase tracking-wide opacity-60">
          Opcional. Dá para criar sala sem conta.
        </p>
        {erro ? (
          <p role="alert" className="mt-2 font-action text-xs uppercase text-accent-dark">
            {erro}
          </p>
        ) : null}
      </Card>
    );
  }

  return (
    <Card variant="dashed" className="w-full max-w-md p-4">
      <p className="flex items-center gap-2 font-action text-sm uppercase">
        <ShieldCheck strokeWidth={3} className="size-5" />
        {perfil?.email ?? "Conta ligada"}
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <label className="font-hand text-base uppercase" htmlFor="perfil-nick">
          Seu apelido
        </label>
        <input
          id="perfil-nick"
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 14))}
          maxLength={14}
          placeholder="Como te chamam?"
          className="min-h-12 w-full border-4 border-ink bg-paper px-3 font-display text-xl
                     focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />

        <label className="font-hand text-base uppercase" htmlFor="perfil-ano">
          Ano de nascimento
        </label>
        <input
          id="perfil-ano"
          value={anoNascimento}
          onChange={(e) => setAnoNascimento(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          placeholder="1995"
          className="min-h-12 w-full border-4 border-ink bg-paper px-3 font-display text-xl
                     focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />

        <Button size="sm" variant="solid" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? "Salvando…" : "Salvar perfil"}
        </Button>

        {erro ? (
          <p role="alert" className="font-action text-xs uppercase text-accent-dark">
            {erro}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
