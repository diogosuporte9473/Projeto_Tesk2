import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import TrelloDashboardLayout, { openNewBoardDialog } from "@/components/TrelloDashboardLayout";
import { Loader2, Layout, CheckSquare, Sparkles, Plus, Users, ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Home() {
  const { user, loading, isAuthenticated, refresh } = useAuth();
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      // Atualizar o cache do tRPC manualmente para garantir que a UI mude instantaneamente
      utils.auth.me.setData(undefined, data as any);
      await refresh();
      setLocation("/");
      toast.success("Login realizado com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Falha na autenticação");
    }
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async (data) => {
      utils.auth.me.setData(undefined, data as any);
      await refresh();
      setLocation("/");
      toast.success("Conta criada com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Falha no registro");
    }
  });

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (isSignUp) {
        await registerMutation.mutateAsync({ username, password, name });
      } else {
        await loginMutation.mutateAsync({ username, password });
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Only show the full-page loader on initial session check or when explicitly needed
  if (loading && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t("home.loadingSession")}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const inputClass =
      "w-full h-11 px-3 rounded-lg bg-[#0a0e27]/60 border border-[#00d9ff26] text-[#e8eaed] placeholder:text-[#a0aec0]/60 outline-none transition focus:border-[#00d9ff] focus:ring-2 focus:ring-[#00d9ff]/30";

    return (
      <div className="min-h-screen dms-grid text-[#e8eaed] flex flex-col">
        <header className="flex items-center gap-3 px-6 py-5 lg:px-12">
          <div className="w-10 h-10 rounded-xl border border-[#00d9ff40] bg-[#00d9ff14] flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-[#00d9ff]" />
          </div>
          <p className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>DStasks</p>
        </header>

        <main className="flex-1 flex items-center px-6 pb-12 lg:px-12">
          <div className="w-full max-w-6xl mx-auto grid gap-12 lg:grid-cols-2 lg:items-center">
            <section className="hidden lg:block">
              <span className="dms-badge">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00d9ff] animate-pulse" />
                Gestão de tarefas para equipes
              </span>
              <h1 className="mt-6 text-5xl xl:text-6xl font-bold leading-tight">
                Bem-vindo ao
                <br />
                <span className="dms-gradient-text">DStasks</span>
              </h1>
              <p className="mt-6 text-lg text-[#a0aec0] max-w-md leading-relaxed">
                {t("home.centerSubtitle")}
              </p>
              <ul className="mt-8 space-y-3 text-sm text-[#e8eaed]/90">
                <li className="flex items-center gap-3">
                  <Layout className="w-4 h-4 text-[#00d9ff]" /> {t("home.dynamicBoards")}
                </li>
                <li className="flex items-center gap-3">
                  <CheckSquare className="w-4 h-4 text-[#00d9ff]" /> {t("home.checklistsLabels")}
                </li>
                <li className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-[#b062ea]" /> {t("home.aiAssistant")}
                </li>
              </ul>
            </section>

            <section className="w-full max-w-md mx-auto lg:ml-auto lg:mr-0 rounded-2xl p-8 border border-[#00d9ff26] bg-[#1a1f3a]/70 backdrop-blur-md shadow-[0_0_0_1px_#00d9ff1a,0_20px_60px_-20px_#00d9ff55]">
              <h2 className="text-2xl font-bold mb-1">
                {isSignUp ? t("home.signUp") : t("home.signIn")}
              </h2>
              <p className="text-sm text-[#a0aec0] mb-8">
                {isSignUp ? t("home.authSubtitleSignup") : t("home.authSubtitleSignin")}
              </p>

              <form onSubmit={handleAuth} className="space-y-4">
                {isSignUp && (
                  <div className="space-y-1.5">
                    <label htmlFor="auth-name" className="text-sm font-medium">{t("home.name")}</label>
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                      placeholder={t("home.yourName")}
                      autoComplete="name"
                      required
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label htmlFor="auth-user" className="text-sm font-medium">{t("home.userEmail")}</label>
                  <input
                    id="auth-user"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={inputClass}
                    placeholder="exemplo@email.com"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="auth-pass" className="text-sm font-medium">{t("home.password")}</label>
                  <input
                    id="auth-pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    minLength={isSignUp ? 6 : undefined}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={authLoading}
                  className="w-full h-11 bg-[#00d9ff] hover:bg-[#33e1ff] text-[#0a0e27] font-bold shadow-[0_8px_30px_-8px_#00d9ff]"
                >
                  {authLoading ? <Loader2 className="animate-spin mr-2" /> : null}
                  {isSignUp ? t("home.signUp") : t("home.signIn")}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-[#00d9ff] hover:underline text-sm"
                >
                  {isSignUp ? t("home.haveAccount") : t("home.noAccount")}
                </button>
              </div>
            </section>
          </div>
        </main>
        <footer className="px-6 pb-4 text-center text-[10px] tracking-wide text-[#a0aec0]/50">por DMS Security</footer>
      </div>
    );
  }

  return (
    <TrelloDashboardLayout>
      <HomeDashboard userName={user?.name || ""} />
    </TrelloDashboardLayout>
  );
}

function HomeDashboard({ userName }: { userName: string }) {
  const { t, language } = useLanguage();
  const en = language === "en";
  const { data: boards, isLoading } = trpc.boards.list.useQuery();
  const { data: stats } = trpc.stats.getGeneral.useQuery();

  const hour = new Date().getHours();
  const greeting = en
    ? hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
    : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const today = new Date().toLocaleDateString(en ? "en-US" : "pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const firstName = userName.split(" ")[0] || "";

  const tiles = [
    { label: en ? "Boards" : "Quadros", value: stats?.totalBoards, icon: Layout, tone: "text-primary bg-primary/12" },
    { label: en ? "Cards" : "Cartões", value: stats?.totalCards, icon: CheckSquare, tone: "text-secondary bg-secondary/15" },
    { label: en ? "People" : "Pessoas", value: stats?.totalUsers, icon: Users, tone: "text-emerald-500 bg-emerald-500/12" },
  ];

  const list = (boards || []) as any[];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] capitalize text-muted-foreground">{today}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight lg:text-3xl">
            {greeting}
            {firstName ? ", " : ""}
            <span className="dms-gradient-text">{firstName}</span>
          </h1>
        </div>
        <Button onClick={openNewBoardDialog} className="gap-1.5">
          <Plus className="h-4 w-4" /> {t("layout.newBoard")}
        </Button>
      </header>

      <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tile.tone}`}>
              <tile.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-none tabular-nums">{tile.value ?? "–"}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{tile.label}</p>
            </div>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("layout.yourBoards")}</h2>
          {list.length > 0 && <span className="text-xs text-muted-foreground">{list.length}</span>}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-foreground/[0.06]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-input px-6 py-14 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Layout className="h-7 w-7" />
            </span>
            <h3 className="text-lg font-semibold">{en ? "Create your first board" : "Crie seu primeiro quadro"}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {en
                ? "Boards organize the work into lists and cards. Start with one per team or project."
                : "Os quadros organizam o trabalho em listas e cartões. Comece com um por equipe ou projeto."}
            </p>
            <Button onClick={openNewBoardDialog} className="mt-5 gap-1.5">
              <Plus className="h-4 w-4" /> {t("layout.newBoard")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((board) => {
              const color = board.color || "var(--primary)";
              return (
                <Link
                  key={board.id}
                  href={`/board/${board.id}`}
                  className="group flex h-32 flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-pop)]"
                >
                  <span className="h-10 w-full flex-shrink-0" style={{ background: `linear-gradient(120deg, ${color}, ${color}66)` }} />
                  <span className="flex min-h-0 flex-1 flex-col justify-between p-3">
                    <span>
                      <span className="block truncate text-[15px] font-semibold">{board.name}</span>
                      {board.description && (
                        <span className="block truncate text-[13px] text-muted-foreground">{board.description}</span>
                      )}
                    </span>
                    <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate">{board.tenantName || ""}</span>
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={openNewBoardDialog}
              className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-input text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-foreground/[0.03] hover:text-foreground"
            >
              <Plus className="h-5 w-5" />
              {t("layout.newBoard")}
            </button>
          </div>
        )}
      </section>

      <p className="mt-10 text-xs text-muted-foreground">
        {en ? "Tip: press " : "Dica: pressione "}
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
        {en ? " to jump to any board." : " para ir direto a qualquer quadro."}
      </p>
    </div>
  );
}
