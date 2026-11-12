import { useRealtimeSync } from "@/_core/hooks/useRealtimeSync";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart3,
  Check,
  ChevronsUpDown,
  Home,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { themeIcon } from "@/lib/themeIcons";
import { BOARD_THEMES, SEGMENT_THEME_KEYS, getBoardTheme, type BoardThemeKey } from "@shared/boardThemes";

interface TrelloDashboardLayoutProps {
  children: React.ReactNode;
}

/** Evento global para abrir o diálogo "Novo quadro" de qualquer tela. */
export const NEW_BOARD_EVENT = "dstasks:new-board";
export const openNewBoardDialog = () => window.dispatchEvent(new Event(NEW_BOARD_EVENT));

export const BOARD_COLORS = [
  "#00d9ff",
  "#3b82f6",
  "#9d4edd",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#64748b",
];

const COLLAPSE_KEY = "dstasks_sidebar_collapsed";

export default function TrelloDashboardLayout({ children }: TrelloDashboardLayoutProps) {
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();
  const { appName, appLogo } = useBranding();
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const en = language === "en";

  // Ativa sincronização global para a barra lateral (boards)
  useRealtimeSync();

  const utils = trpc.useUtils();
  const { data: boards, isLoading } = trpc.boards.list.useQuery();
  const createBoardMutation = trpc.boards.create.useMutation();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardColor, setNewBoardColor] = useState(BOARD_COLORS[0]);
  const [newBoardTheme, setNewBoardTheme] = useState<BoardThemeKey>("general");

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      } catch {}
      return !prev;
    });
  };

  // Ctrl/Cmd+K abre a busca; outras telas pedem "novo quadro" por evento.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    const onNewBoard = () => setShowNewBoard(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(NEW_BOARD_EVENT, onNewBoard);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(NEW_BOARD_EVENT, onNewBoard);
    };
  }, []);

  // Fecha o menu móvel ao trocar de página.
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const handleCreateBoard = async () => {
    const name = newBoardName.trim();
    if (!name || createBoardMutation.isPending) return;
    try {
      const created: any = await createBoardMutation.mutateAsync({
        name,
        description: "",
        color: newBoardColor,
        theme: newBoardTheme,
      });
      await utils.boards.list.invalidate();
      setNewBoardName("");
      setNewBoardTheme("general");
      setShowNewBoard(false);
      toast.success(en ? "Board created" : "Quadro criado");
      if (created?.id) setLocation(`/board/${created.id}`);
    } catch (error: any) {
      toast.error(error?.message || (en ? "Could not create the board" : "Não foi possível criar o quadro"));
    }
  };

  const isMaster = user?.role === "master_admin";
  const isAdmin = user?.role === "admin";

  // master_admin enxerga quadros de todas as empresas: agrupa por empresa.
  const boardGroups = useMemo(() => {
    const list = (boards || []) as any[];
    if (!isMaster) return [{ title: null as string | null, items: list }];
    const map = new Map<string, any[]>();
    for (const board of list) {
      const key = board.tenantName || (en ? "General" : "Geral");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(board);
    }
    return Array.from(map.entries()).map(([title, items]) => ({ title, items }));
  }, [boards, isMaster, en]);

  const go = useCallback(
    (path: string) => {
      setPaletteOpen(false);
      setLocation(path);
    },
    [setLocation]
  );

  const initials = (user?.name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const sidebar = (compact: boolean) => (
    <div className="flex h-full flex-col">
      {/* Marca */}
      <div className={cn("flex h-14 items-center gap-2 px-3", compact && "justify-center px-0")}>
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 hover:opacity-90">
          {appLogo ? (
            <img src={appLogo} alt={appName} className="h-7 w-auto max-w-[120px] object-contain" />
          ) : (
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              {appName.charAt(0)}
            </span>
          )}
          {!compact && <span className="truncate text-[15px] font-semibold tracking-tight">{appName}</span>}
        </Link>
        {!compact && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground lg:flex"
            aria-label={en ? "Collapse sidebar" : "Recolher barra lateral"}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Busca */}
      <div className={cn("px-3 pb-2", compact && "px-2")}>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-foreground/[0.04] px-2.5 text-[13px] text-sidebar-foreground/60 transition-colors hover:bg-sidebar-foreground/[0.08] hover:text-sidebar-foreground",
            compact && "justify-center px-0"
          )}
          aria-label={en ? "Search" : "Buscar"}
        >
          <Search className="h-4 w-4 flex-shrink-0" />
          {!compact && (
            <>
              <span className="flex-1 text-left">{en ? "Search…" : "Buscar…"}</span>
              <kbd className="rounded border border-sidebar-border px-1.5 text-[10px] font-medium text-sidebar-foreground/50">
                Ctrl K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Navegação */}
      <nav className={cn("thin-scroll flex-1 overflow-y-auto px-3 pb-3", compact && "px-2")}>
        <SideLink href="/" active={location === "/"} compact={compact} label={en ? "Home" : "Início"}>
          <Home className="h-4 w-4 flex-shrink-0" />
        </SideLink>
        <SideLink href="/dashboard" active={location === "/dashboard"} compact={compact} label={en ? "Dashboard" : "Painel"}>
          <BarChart3 className="h-4 w-4 flex-shrink-0" />
        </SideLink>

        <div className={cn("mb-1 mt-5 flex items-center justify-between px-2", compact && "justify-center px-0")}>
          {!compact && (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {t("layout.yourBoards")}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setShowNewBoard(true)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-sidebar-foreground/55 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
                aria-label={t("layout.newBoard")}
              >
                <Plus className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("layout.newBoard")}</TooltipContent>
          </Tooltip>
        </div>

        {isLoading ? (
          <div className="space-y-1.5 px-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-sidebar-foreground/10" />
            ))}
          </div>
        ) : boards && boards.length > 0 ? (
          <div className="space-y-3">
            {boardGroups.map((group) => (
              <div key={group.title ?? "all"} className="space-y-0.5">
                {group.title && !compact && (
                  <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35">
                    {group.title}
                  </p>
                )}
                {group.items.map((board: any) => (
                  <SideLink
                    key={board.id}
                    href={`/board/${board.id}`}
                    active={location === `/board/${board.id}`}
                    compact={compact}
                    label={board.name}
                  >
                    <span
                      className="h-3.5 w-3.5 flex-shrink-0 rounded-[5px]"
                      style={{ backgroundColor: board.color || "var(--primary)" }}
                    />
                  </SideLink>
                ))}
              </div>
            ))}
          </div>
        ) : (
          !compact && (
            <button
              type="button"
              onClick={() => setShowNewBoard(true)}
              className="mx-1 mt-1 w-[calc(100%-0.5rem)] rounded-lg border border-dashed border-sidebar-border px-3 py-4 text-center text-xs text-sidebar-foreground/55 hover:border-primary/50 hover:text-sidebar-foreground"
            >
              {t("layout.noBoardsYet")}
              <span className="mt-1 block font-semibold text-primary">+ {t("layout.newBoard")}</span>
            </button>
          )
        )}

        {(isMaster || isAdmin) && (
          <div className="mt-5 space-y-0.5">
            {!compact && (
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                {en ? "Administration" : "Administração"}
              </p>
            )}
            {isMaster && (
              <SideLink href="/master" active={location === "/master"} compact={compact} label={en ? "Master panel" : "Painel Master"}>
                <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              </SideLink>
            )}
            {isAdmin && (
              <SideLink href="/admin" active={location === "/admin"} compact={compact} label={en ? "Users" : "Usuários"}>
                <Users className="h-4 w-4 flex-shrink-0" />
              </SideLink>
            )}
          </div>
        )}
      </nav>

      {/* Usuário */}
      <div className={cn("border-t border-sidebar-border p-2", compact && "flex flex-col items-center gap-1")}>
        {compact && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
            aria-label={en ? "Expand sidebar" : "Expandir barra lateral"}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-foreground/[0.07]",
                compact && "w-auto"
              )}
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-[11px] font-bold text-white">
                {initials}
              </span>
              {!compact && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight">
                      {user?.name || t("layout.userFallback")}
                    </span>
                    <span className="block truncate text-[11px] leading-tight text-sidebar-foreground/55">
                      {user?.username}
                    </span>
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-sidebar-foreground/40" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {user?.username}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/settings")}>
              <Settings className="h-4 w-4" /> {t("layout.settings")}
            </DropdownMenuItem>
            {toggleTheme && (
              <DropdownMenuItem onClick={toggleTheme}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? (en ? "Light theme" : "Tema claro") : en ? "Dark theme" : "Tema escuro"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> {t("layout.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Barra lateral — desktop */}
      <aside
        className={cn(
          "hidden flex-shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:block",
          collapsed ? "w-[60px]" : "w-[252px]"
        )}
      >
        {sidebar(collapsed)}
      </aside>

      {/* Barra lateral — celular (gaveta) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl">
            {sidebar(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior — só no celular */}
        <header className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border bg-sidebar px-2 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="flex-1 truncate text-sm font-semibold">{appName}</span>
          <Button variant="ghost" size="icon" onClick={() => setPaletteOpen(true)} aria-label={en ? "Search" : "Buscar"}>
            <Search className="h-4 w-4" />
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>

      {/* Busca rápida (Ctrl+K) */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder={en ? "Search boards and actions…" : "Buscar quadros e ações…"} />
        <CommandList>
          <CommandEmpty>{en ? "Nothing found." : "Nada encontrado."}</CommandEmpty>
          {boards && boards.length > 0 && (
            <CommandGroup heading={en ? "Boards" : "Quadros"}>
              {(boards as any[]).map((board) => (
                <CommandItem key={board.id} value={`${board.name} ${board.id}`} onSelect={() => go(`/board/${board.id}`)}>
                  <span className="h-3 w-3 rounded-[4px]" style={{ backgroundColor: board.color || "var(--primary)" }} />
                  {board.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading={en ? "Actions" : "Ações"}>
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                setShowNewBoard(true);
              }}
            >
              <Plus className="h-4 w-4" /> {t("layout.newBoard")}
            </CommandItem>
            <CommandItem onSelect={() => go("/")}>
              <Home className="h-4 w-4" /> {en ? "Home" : "Início"}
            </CommandItem>
            <CommandItem onSelect={() => go("/dashboard")}>
              <BarChart3 className="h-4 w-4" /> {en ? "Dashboard" : "Painel"}
            </CommandItem>
            <CommandItem onSelect={() => go("/settings")}>
              <Settings className="h-4 w-4" /> {t("layout.settings")}
            </CommandItem>
            {toggleTheme && (
              <CommandItem
                onSelect={() => {
                  toggleTheme();
                  setPaletteOpen(false);
                }}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {en ? "Toggle theme" : "Alternar tema claro/escuro"}
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Novo quadro */}
      <Dialog open={showNewBoard} onOpenChange={setShowNewBoard}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("layout.newBoard")}</DialogTitle>
            <DialogDescription>
              {en ? "Give it a name and pick a color." : "Dê um nome e escolha uma cor para identificar o quadro."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="flex h-20 items-end rounded-xl p-3 text-sm font-semibold text-white"
              style={{ background: `linear-gradient(135deg, ${newBoardColor}, ${newBoardColor}99)` }}
            >
              <span className="truncate drop-shadow">{newBoardName || t("layout.boardName")}</span>
            </div>
            <input
              type="text"
              autoFocus
              placeholder={t("layout.boardName")}
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <div className="flex flex-wrap gap-2">
              {BOARD_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewBoardColor(color)}
                  aria-label={color}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-transform hover:scale-110",
                    newBoardColor === color && "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  )}
                  style={{ backgroundColor: color }}
                >
                  {newBoardColor === color && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{en ? "Theme" : "Tema"}</p>
              <div className="flex flex-wrap gap-1.5">
                {(["general", ...SEGMENT_THEME_KEYS] as BoardThemeKey[]).map((key) => {
                  const option = BOARD_THEMES[key];
                  const Icon = themeIcon(option);
                  const active = newBoardTheme === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setNewBoardTheme(key);
                        if (key !== "general") setNewBoardColor(option.palette.primary);
                      }}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
                        active ? "border-primary/60 bg-primary/12 text-foreground" : "border-input text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {option.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {newBoardTheme === "general"
                  ? (en ? "Free board with an inbox list." : "Quadro livre, com uma lista Caixa de Entrada.")
                  : (en ? "Starts with the suggested flow: " : "Começa com o fluxo sugerido: ") + getBoardTheme(newBoardTheme).lists.length + (en ? " lists." : " listas.")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewBoard(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreateBoard} disabled={!newBoardName.trim() || createBoardMutation.isPending}>
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SideLink({
  href,
  active,
  compact,
  label,
  children,
}: {
  href: string;
  active: boolean;
  compact: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const link = (
    <Link href={href} className={cn("nav-item", compact && "justify-center px-0")} data-active={active}>
      {children}
      {!compact && <span className="truncate">{label}</span>}
    </Link>
  );
  if (!compact) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
