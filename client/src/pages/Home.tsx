import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import TrelloDashboardLayout from "@/components/TrelloDashboardLayout";
import { Loader2, Layout, CheckSquare, Sparkles, MessageSquare, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
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
            <ShieldCheck className="w-5 h-5 text-[#00d9ff]" />
          </div>
          <div className="leading-tight">
            <p className="font-bold tracking-wide" style={{ fontFamily: "var(--font-display)" }}>DMS</p>
            <p className="text-[10px] tracking-[0.3em] text-[#00d9ff]">SECURITY</p>
          </div>
        </header>

        <main className="flex-1 flex items-center px-6 pb-12 lg:px-12">
          <div className="w-full max-w-6xl mx-auto grid gap-12 lg:grid-cols-2 lg:items-center">
            <section className="hidden lg:block">
              <span className="dms-badge">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00d9ff] animate-pulse" />
                Gestão de tarefas do grupo DMS Security
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
      </div>
    );
  }

  return (
    <TrelloDashboardLayout>
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-3">{t("home.welcome")}, <span className="dms-gradient-text">{user?.name}</span></h1>
            <p className="text-xl text-muted-foreground">
              {t("home.centerSubtitle")}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-card/70 p-8 rounded-2xl border border-border hover:border-primary/50 hover:shadow-[var(--glow)] transition-all group">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                <Layout className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">{t("home.dynamicBoards")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("home.dynamicBoardsDesc")}
              </p>
            </div>

            <div className="bg-card/70 p-8 rounded-2xl border border-border hover:border-primary/50 hover:shadow-[var(--glow)] transition-all group">
              <div className="w-12 h-12 bg-secondary/15 rounded-xl flex items-center justify-center mb-6 group-hover:bg-secondary/25 transition-colors">
                <CheckSquare className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">{t("home.checklistsLabels")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("home.checklistsLabelsDesc")}
              </p>
            </div>

            <div className="bg-card/70 p-8 rounded-2xl border border-border hover:border-primary/50 hover:shadow-[var(--glow)] transition-all group">
              <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-green-500/20 transition-colors">
                <Sparkles className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">{t("home.aiAssistant")}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {t("home.aiAssistantDesc")}
              </p>
            </div>
          </div>

          <div className="mt-16 p-8 rounded-3xl border border-[#00d9ff33] text-[#e8eaed] bg-[linear-gradient(120deg,#0d1230,#1a1f3a_55%,#2a1a55)] shadow-[var(--glow)]">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex-1">
                <h2 className="text-3xl font-bold mb-4">{t("home.readyToStart")}</h2>
                <p className="text-[#a0aec0] text-lg">
                  {t("home.readyToStartDesc")}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                   <p className="text-sm font-medium mb-2 opacity-80 italic">{t("home.aiTip")}</p>
                   <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/20">
                     <MessageSquare className="w-4 h-4" />
                     <span className="text-sm font-semibold">{t("home.aiActive")}</span>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TrelloDashboardLayout>
  );
}
