import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const PASSWORD_MIN = 10;

type LinkState =
  | { status: "reading" }
  | { status: "ready"; token: string; kind: string }
  | { status: "invalid"; reason: string };

/** Lê os dados que o link de convite/redefinição traz depois do "#". */
function readLink(): LinkState {
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  // O link carrega uma credencial: some da barra de endereço e do histórico.
  if (hash) window.history.replaceState(null, "", window.location.pathname);

  if (params.get("error") || params.get("error_code")) {
    const expired = (params.get("error_code") || "").includes("expired");
    return {
      status: "invalid",
      reason: expired
        ? "Este link expirou. Peça um novo ao administrador ou use “Esqueci minha senha” na tela de entrada."
        : "Este link não é válido. Peça um novo ao administrador ou use “Esqueci minha senha” na tela de entrada.",
    };
  }
  const token = params.get("access_token");
  if (!token) {
    return { status: "invalid", reason: "Abra esta página pelo link recebido por e-mail." };
  }
  return { status: "ready", token, kind: params.get("type") || "recovery" };
}

/** Página aberta pelo link de convite ou de redefinição: define a senha e entra. */
export default function AccessPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [link, setLink] = useState<LinkState>({ status: "reading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const completeAccess = trpc.auth.completeAccess.useMutation();

  useEffect(() => {
    setLink(readLink());
  }, []);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = link.status === "ready" && password.length >= PASSWORD_MIN && password === confirm && !completeAccess.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || link.status !== "ready") return;
    try {
      await completeAccess.mutateAsync({ accessToken: link.token, password });
      await utils.auth.me.invalidate();
      toast.success("Senha definida. Bem-vindo!");
      setLocation("/");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível definir a senha");
    }
  };

  const isInvite = link.status === "ready" && (link.kind === "invite" || link.kind === "signup");
  const inputClass =
    "h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-base text-white outline-none placeholder:text-[#a0aec0]/60 focus:border-[#00d9ff]/60 focus:ring-2 focus:ring-[#00d9ff]/25";

  return (
    <div className="dms-grid flex min-h-[100dvh] flex-col text-[#e8eaed]">
      <header className="px-6 py-5 text-lg font-bold tracking-tight">DStasks</header>
      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1535]/80 p-6 shadow-2xl backdrop-blur sm:p-8">
          {link.status === "reading" && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#00d9ff]" />
            </div>
          )}

          {link.status === "invalid" && (
            <div className="space-y-4 text-center">
              <TriangleAlert className="mx-auto h-8 w-8 text-amber-400" />
              <h1 className="text-xl font-bold">Não foi possível continuar</h1>
              <p className="text-sm text-[#a0aec0]">{link.reason}</p>
              <Button onClick={() => setLocation("/")} className="h-11 w-full bg-[#00d9ff] font-bold text-[#0a0e27] hover:bg-[#33e1ff]">
                Ir para a tela de entrada
              </Button>
            </div>
          )}

          {link.status === "ready" && (
            <>
              <KeyRound className="mb-4 h-8 w-8 text-[#00d9ff]" />
              <h1 className="mb-1 text-2xl font-bold">{isInvite ? "Crie sua senha" : "Defina uma nova senha"}</h1>
              <p className="mb-6 text-sm text-[#a0aec0]">
                {isInvite ? "Você foi convidado para o DStasks. Escolha uma senha para entrar." : "Escolha a nova senha da sua conta."}
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="access-pass" className="text-sm font-medium">Nova senha</label>
                  <input
                    id="access-pass"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    aria-describedby="access-pass-hint"
                    required
                  />
                  <p id="access-pass-hint" className={`text-xs ${tooShort ? "text-red-400" : "text-[#a0aec0]"}`}>
                    Mínimo de {PASSWORD_MIN} caracteres e sem conter o seu login. Uma frase longa é melhor que símbolos.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="access-confirm" className="text-sm font-medium">Confirme a senha</label>
                  <input
                    id="access-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                    required
                  />
                  {mismatch && <p className="text-xs text-red-400">As senhas não são iguais.</p>}
                </div>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="h-11 w-full bg-[#00d9ff] font-bold text-[#0a0e27] shadow-[0_8px_30px_-8px_#00d9ff] hover:bg-[#33e1ff]"
                >
                  {completeAccess.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isInvite ? "Criar senha e entrar" : "Salvar e entrar"}
                </Button>
              </form>
            </>
          )}
        </section>
      </main>
      <footer className="px-6 pb-4 text-center text-[10px] tracking-wide text-[#a0aec0]/50">por DMS Security</footer>
    </div>
  );
}
