import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRealtimeSync } from "@/_core/hooks/useRealtimeSync";
import { trpc } from "@/lib/trpc";
import TrelloDashboardLayout from "@/components/TrelloDashboardLayout";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, MessageSquare, X, UserPlus, Users, Trash2, MoreHorizontal, Edit2, Archive, Settings2, AlignLeft, Tag, CheckSquare, Clock, LayoutGrid, Paperclip, History as HistoryIcon, Search, Sparkles, User as UserIcon, AlertCircle, CalendarClock, Columns3, Palette, BarChart3, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useRef, useEffect, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  useSensor,
  MouseSensor,
  TouchSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DraggableCard } from "@/components/DraggableCard";
import BoardThemeDialog from "@/components/BoardThemeDialog";
import BoardDashboard from "@/components/BoardDashboard";
import AutomationsDialog from "@/components/AutomationsDialog";
import { themeIcon } from "@/lib/themeIcons";
import { getBoardTheme, type BoardSettings } from "@shared/boardThemes";
import { AIChatBox, Message } from "@/components/AIChatBox";
import { toast } from "sonner";
import type { List as DBList, Card as DBCard } from "../../../drizzle/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CardWithUser extends DBCard {
  labels?: { id: number; label: string; color: string }[];
  fields?: Record<string, string>;
  assignedToName?: string | null;
  checklistCount?: number;
  completedChecklistCount?: number;
  attachmentCount?: number;
}

export default function BoardView() {
  const [, params] = useRoute("/board/:id");
  const boardId = params?.id ? parseInt(params.id) : null;
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === "en";
  
  // Ativa sincronização em tempo real para este quadro
  useRealtimeSync(boardId || undefined);

  const { data: board, isLoading: boardLoading } = trpc.boards.get.useQuery(
    { id: boardId || 0 },
    { enabled: !!boardId } as any
  );

  const { data: lists, isLoading: listsLoading } = trpc.lists.getByBoard.useQuery(
    { boardId: boardId || 0 },
    { enabled: !!boardId } as any
  );

  const [newListName, setNewListName] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  const [cardQuery, setCardQuery] = useState("");
  const [cardFilter, setCardFilter] = useState<CardFilter>("all");
  const [showAIChat, setShowAIChat] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [showMirrorSettings, setShowMirrorSettings] = useState(false);
  const [showThemeDialog, setShowThemeDialog] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);
  const [view, setView] = useState<"kanban" | "dashboard">("kanban");
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "You are a helpful assistant for the DStasks. You can help users organize their tasks, suggest project steps, and answer questions about their boards." }
  ]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    // No celular: segurar o cartão para arrastar; deslizar continua rolando.
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const utils = trpc.useUtils();
  const createListMutation = trpc.lists.create.useMutation();
  const reorderCardMutation = trpc.cards.reorder.useMutation();
  const updateBoardMutation = trpc.boards.update.useMutation();
  const deleteBoardMutation = trpc.boards.delete.useMutation();
  const aiChatMutation = trpc.ai.chat.useMutation();
  const [, setLocation] = useLocation();
  const runScheduledMutation = trpc.automations.runScheduled.useMutation();
  useEffect(() => {
    if (!boardId) return;
    runScheduledMutation.mutate(
      { boardId },
      {
        onSuccess: (result) => {
          if (result.ran > 0) {
            utils.cards.getByList.invalidate();
            utils.notifications.list.invalidate();
          }
        },
        onError: () => {},
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [editedBoardName, setEditedBoardName] = useState("");
  const [showActivityModal, setShowActivityModal] = useState(false);

  useEffect(() => {
    (window as any).showBoardActivity = () => setShowActivityModal(true);
    return () => { delete (window as any).showBoardActivity; };
  }, []);

  // @ts-ignore
  const { data: boardActivity, isLoading: logsLoading } = trpc.audit.list.useQuery({
    // Não filtra por nome do quadro: os logs usam `entity_name` (ex: título do card),
    // então filtrar por `board.name` costuma retornar vazio mesmo com logs gravados.
    limit: 10,
  }, { enabled: !!board?.name && showActivityModal } as any);

  useEffect(() => {
    if (board) {
      setEditedBoardName(board.name);
    }
  }, [board]);

  const handleUpdateBoardName = async () => {
    if (!editedBoardName.trim() || !boardId || editedBoardName === board?.name) {
      setIsEditingBoardName(false);
      return;
    }

    try {
      await updateBoardMutation.mutateAsync({
        id: boardId,
        name: editedBoardName,
      });
      setIsEditingBoardName(false);
      toast.success(isEnglish ? "Board renamed" : "Quadro renomeado");
      utils.boards.get.invalidate({ id: boardId });
    } catch (error) {
      toast.error(isEnglish ? "Error renaming board" : "Erro ao renomear quadro");
    }
  };

  const handleDeleteBoard = async () => {
    if (!boardId) return;
    if (!confirm("TEM CERTEZA? Esta ação excluirá o quadro e todos os seus dados permanentemente.")) return;

    try {
      await deleteBoardMutation.mutateAsync({ id: boardId });
      toast.success("Quadro excluído");
      setLocation("/");
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir quadro");
    }
  };

  const handleSendMessage = async (content: string, options?: { useWebSearch?: boolean; shortResponse?: boolean }) => {
    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    
    try {
      const response = await aiChatMutation.mutateAsync({ 
        messages: newMessages,
        useWebSearch: options?.useWebSearch,
        shortResponse: options?.shortResponse
      });
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (error) {
      toast.error("Erro ao falar com a IA");
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim() || !boardId) return;

    try {
      await createListMutation.mutateAsync({
        boardId,
        name: newListName,
      });
      // Garante atualização imediata das colunas sem precisar refresh manual.
      await utils.lists.getByBoard.invalidate({ boardId });
      setNewListName("");
      setShowNewList(false);
    } catch (error) {
      console.error("Error creating list:", error);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const activeParts = activeId.split("-");
    const overParts = overId.split("-");

    if (activeParts[0] === "card") {
      const cardId = parseInt(activeParts[1]);
      let newListId: number | null = null;

      if (overParts[0] === "card") {
        newListId = parseInt(overParts[2]);
      } else if (overParts[0] === "list") {
        newListId = parseInt(overParts[1]);
      }

      if (cardId && newListId) {
        try {
          await reorderCardMutation.mutateAsync({
            cardId,
            newListId,
            newPosition: 0,
          });
          toast.success(isEnglish ? "Card moved" : "Cartão movido");
          utils.cards.getByList.invalidate();
        } catch (error) {
          toast.error(isEnglish ? "Error moving card" : "Erro ao mover cartão");
        }
      }
    }
  };

  if (boardLoading || listsLoading) {
    return (
      <TrelloDashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </TrelloDashboardLayout>
    );
  }

  if (!board) {
    return (
      <TrelloDashboardLayout>
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <h1 className="text-lg font-semibold">{isEnglish ? "Board not found" : "Quadro não encontrado"}</h1>
          <p className="text-sm text-muted-foreground">
            {isEnglish ? "It may have been deleted or you no longer have access." : "Ele pode ter sido excluído ou você não tem mais acesso."}
          </p>
          <Button variant="outline" className="mt-3" onClick={() => setLocation("/")}>
            {isEnglish ? "Back to home" : "Voltar ao início"}
          </Button>
        </div>
      </TrelloDashboardLayout>
    );
  }

  const isAdminLike = user?.role === "admin" || user?.role === "master_admin";
  const isOwnerOrAdmin = user?.id === board.ownerId || isAdminLike;
  const hasLists = !!lists && (lists as DBList[]).length > 0;
  const boardTheme = getBoardTheme((board as any).theme);
  const ThemeIcon = themeIcon(boardTheme);
  const filtering = cardQuery.trim() !== "" || cardFilter !== "all";

  const filterChips: { key: CardFilter; label: string; icon: typeof UserIcon }[] = [
    { key: "mine", label: isEnglish ? "Assigned to me" : "Minhas", icon: UserIcon },
    { key: "overdue", label: isEnglish ? "Overdue" : "Atrasadas", icon: AlertCircle },
    { key: "today", label: isEnglish ? "Due today" : "Para hoje", icon: CalendarClock },
  ];

  return (
    <TrelloDashboardLayout>
      <div className="flex h-full flex-col">
        <BoardActivityModal
          isOpen={showActivityModal}
          onClose={() => setShowActivityModal(false)}
          boardName={board.name}
          logs={boardActivity?.logs || []}
          isLoading={logsLoading}
        />

        {/* Cabeçalho do quadro */}
        <header className="flex-shrink-0 border-b border-border px-4 pb-3 pt-4 lg:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className="h-7 w-7 flex-shrink-0 rounded-lg shadow-sm"
              style={{ background: `linear-gradient(135deg, ${board.color || "var(--primary)"}, ${board.color || "var(--primary)"}99)` }}
            />
            <div className="min-w-0 flex-1 basis-[calc(100%-2.75rem)] sm:basis-0">
              {isEditingBoardName ? (
                <input
                  type="text"
                  value={editedBoardName}
                  onChange={(e) => setEditedBoardName(e.target.value)}
                  className="w-full max-w-lg rounded-md border border-ring bg-transparent px-2 py-0.5 text-xl font-semibold text-foreground outline-none ring-2 ring-ring/30"
                  autoFocus
                  onBlur={handleUpdateBoardName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdateBoardName();
                    if (e.key === "Escape") {
                      setEditedBoardName(board.name);
                      setIsEditingBoardName(false);
                    }
                  }}
                />
              ) : (
                <h1
                  className="group inline-flex max-w-full cursor-text items-center gap-2 rounded-md px-1 text-xl font-semibold text-foreground hover:bg-foreground/[0.05]"
                  onClick={() => setIsEditingBoardName(true)}
                  title={isEnglish ? "Click to rename" : "Clique para renomear"}
                >
                  <span className="truncate">{board.name}</span>
                  <Edit2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </h1>
              )}
              {board.description && <p className="truncate px-1 text-[13px] text-muted-foreground">{board.description}</p>}
            </div>

            {boardTheme.key !== "general" && (
              <button
                type="button"
                onClick={() => isOwnerOrAdmin && setShowThemeDialog(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold"
                style={{ backgroundColor: `${boardTheme.palette.primary}22`, color: `color-mix(in srgb, ${boardTheme.palette.primary} 75%, var(--foreground))` }}
                title={isEnglish ? "Board theme" : "Tema do quadro"}
              >
                <ThemeIcon className="h-3.5 w-3.5" />
                {boardTheme.name}
              </button>
            )}

            <div className="ml-auto flex items-center gap-1 sm:ml-0">
              <HeaderIconButton label={isEnglish ? "Recent activity" : "Últimas atividades"} onClick={() => setShowActivityModal(true)}>
                <HistoryIcon className="h-4 w-4" />
              </HeaderIconButton>
              <HeaderIconButton label={isEnglish ? "Archived items" : "Itens arquivados"} onClick={() => setShowArchivedModal(true)}>
                <Archive className="h-4 w-4" />
              </HeaderIconButton>
              {isOwnerOrAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label={isEnglish ? "More" : "Mais opções"}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => setShowThemeDialog(true)}>
                      <Palette className="h-4 w-4" /> {isEnglish ? "Customize theme" : "Personalizar tema"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowAutomations(true)}>
                      <Zap className="h-4 w-4" /> {isEnglish ? "Automations" : "Automações"}
                    </DropdownMenuItem>
                    {isAdminLike && (
                      <DropdownMenuItem onClick={() => setShowMirrorSettings(true)}>
                        <Settings2 className="h-4 w-4" /> {isEnglish ? "Mirroring settings" : "Configurar espelhamento"}
                      </DropdownMenuItem>
                    )}
                    {isAdminLike && (
                      <DropdownMenuItem onClick={handleDeleteBoard} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4" /> {isEnglish ? "Delete board" : "Excluir quadro"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {isOwnerOrAdmin && (
                <Button onClick={() => setShowShareModal(true)} size="sm" className="ml-1 h-8 gap-1.5">
                  <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">{isEnglish ? "Share" : "Compartilhar"}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Visualização + filtros */}
          {hasLists && (
            <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
              <div className="inline-flex h-9 items-center rounded-lg border border-input p-0.5 sm:h-8" role="tablist" aria-label={isEnglish ? "View" : "Visualização"}>
                {([
                  { key: "kanban", label: "Kanban", icon: Columns3 },
                  { key: "dashboard", label: isEnglish ? "Dashboard" : "Painel", icon: BarChart3 },
                ] as const).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={view === option.key}
                    onClick={() => setView(option.key)}
                    className={cn(
                      "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                      view === option.key ? "bg-foreground/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <option.icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                ))}
              </div>
              {view === "kanban" && (<>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={cardQuery}
                  onChange={(e) => setCardQuery(e.target.value)}
                  placeholder={isEnglish ? "Filter cards…" : "Filtrar cartões…"}
                  className="h-9 w-44 rounded-lg border border-input bg-transparent pl-8 pr-2 text-base outline-none sm:h-8 sm:w-56 sm:text-[13px] transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
                />
              </div>
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setCardFilter(cardFilter === chip.key ? "all" : chip.key)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-medium transition-colors sm:h-8",
                    cardFilter === chip.key
                      ? "border-primary/50 bg-primary/12 text-foreground"
                      : "border-input text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                  )}
                >
                  <chip.icon className="h-3.5 w-3.5" />
                  {chip.label}
                </button>
              ))}
              {filtering && (
                <button
                  type="button"
                  onClick={() => {
                    setCardQuery("");
                    setCardFilter("all");
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> {isEnglish ? "Clear" : "Limpar"}
                </button>
              )}
              </>)}
            </div>
          )}
        </header>

        {/* Painel de indicadores do quadro */}
        {view === "dashboard" && boardId && (
          <div className="thin-scroll flex-1 overflow-y-auto px-4 py-5 lg:px-6">
            <div className="mx-auto max-w-6xl">
              <BoardDashboard boardId={boardId} />
            </div>
          </div>
        )}

        {/* Colunas */}
        <div className={cn("thin-scroll flex-1 snap-x snap-mandatory scroll-px-4 overflow-x-auto overflow-y-hidden px-4 py-4 sm:snap-none lg:px-6", view !== "kanban" && "hidden")}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
            onDragStart={(event) => {
              setActiveId(event.active.id as string);
              setActiveTitle((event.active.data.current as any)?.title || "");
            }}
          >
            <div className="flex h-full items-start gap-3">
              {lists && (lists as DBList[]).map((list: DBList) => (
                <ListColumn
                  key={list.id}
                  listId={list.id}
                  listName={list.name}
                  boardId={board.id}
                  query={cardQuery}
                  filter={cardFilter}
                  currentUserName={user?.name || ""}
                  highlightField={boardTheme.cardHighlight}
                />
              ))}

              {showNewList ? (
                <div className="w-[292px] flex-shrink-0 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] p-2.5">
                  <input
                    type="text"
                    placeholder={isEnglish ? "List name…" : "Nome da lista…"}
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    className="mb-2 h-9 w-full rounded-lg border border-input bg-[var(--surface-2)] px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateList();
                      if (e.key === "Escape") setShowNewList(false);
                    }}
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleCreateList} disabled={createListMutation.isPending} size="sm" className="h-8">
                      {isEnglish ? "Add list" : "Adicionar lista"}
                    </Button>
                    <Button onClick={() => setShowNewList(false)} variant="ghost" size="sm" className="h-8">
                      {isEnglish ? "Cancel" : "Cancelar"}
                    </Button>
                  </div>
                </div>
              ) : hasLists ? (
                <button
                  type="button"
                  onClick={() => setShowNewList(true)}
                  className="flex h-11 w-[292px] flex-shrink-0 items-center gap-2 rounded-2xl border border-dashed border-input px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-foreground/[0.03] hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  {isEnglish ? "Add another list" : "Adicionar outra lista"}
                </button>
              ) : (
                <div className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    <Columns3 className="h-7 w-7" />
                  </div>
                  <h2 className="text-lg font-semibold">{isEnglish ? "This board is empty" : "Este quadro está vazio"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isEnglish
                      ? "Create lists for each stage of the work, such as To do, Doing and Done."
                      : "Crie listas para cada etapa do trabalho, como A fazer, Em andamento e Concluído."}
                  </p>
                  <Button onClick={() => setShowNewList(true)} className="mt-5 gap-1.5">
                    <Plus className="h-4 w-4" /> {isEnglish ? "Create first list" : "Criar primeira lista"}
                  </Button>
                </div>
              )}
            </div>

            <DragOverlay>
              {activeId && activeId.startsWith("card-") ? (
                <div className="w-[272px] rotate-2 cursor-grabbing rounded-xl border border-primary/50 bg-[var(--surface-2)] p-3 shadow-[var(--shadow-pop)]">
                  <p className="text-[13.5px] font-medium text-foreground">
                    {activeTitle || (isEnglish ? "Moving card…" : "Movendo cartão…")}
                  </p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Share Modal */}
        {boardId && (
          <ShareModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            boardId={boardId}
            isAdmin={isAdminLike}
          />
        )}

        {/* Personalizar tema */}
        {boardId && (
          <BoardThemeDialog
            isOpen={showThemeDialog}
            onClose={() => setShowThemeDialog(false)}
            boardId={boardId}
            currentTheme={boardTheme.key}
            currentSettings={((board as any).settings || {}) as BoardSettings}
            existingLists={((lists as DBList[]) || []).map((list) => list.name)}
          />
        )}

        {/* Automações */}
        {boardId && showAutomations && (
          <AutomationsDialog
            isOpen={showAutomations}
            onClose={() => setShowAutomations(false)}
            boardId={boardId}
            themeKey={boardTheme.key}
            lists={((lists as DBList[]) || []).map((list) => list.name)}
            canManage={isOwnerOrAdmin}
          />
        )}

        {/* Mirror Settings Modal */}
        {boardId && showMirrorSettings && (
          <MirrorSettingsModal
            isOpen={showMirrorSettings}
            onClose={() => setShowMirrorSettings(false)}
            boardId={boardId}
          />
        )}

        {/* Archived Cards Modal */}
        {boardId && showArchivedModal && (
          <ArchivedCardsModal
            isOpen={showArchivedModal}
            onClose={() => setShowArchivedModal(false)}
            boardId={boardId}
          />
        )}

        {/* Assistente de IA */}
        <div className="fixed bottom-5 right-5 z-40">
          {showAIChat ? (
            <div className="flex h-[min(520px,calc(100vh-6rem))] w-[min(384px,calc(100vw-2.5rem))] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-[var(--shadow-pop)]">
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  {isEnglish ? "AI assistant" : "Assistente IA"}
                </div>
                <Button onClick={() => setShowAIChat(false)} variant="ghost" size="icon" className="h-8 w-8" aria-label={isEnglish ? "Close" : "Fechar"}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <AIChatBox
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={aiChatMutation.isPending}
                height="100%"
                className="min-h-0 flex-1 rounded-none border-0"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAIChat(true)}
              className="flex h-12 items-center gap-2 rounded-full bg-gradient-to-br from-primary to-secondary px-4 text-sm font-semibold text-white shadow-[var(--shadow-pop)] transition-transform hover:scale-105 active:scale-95"
              aria-label={isEnglish ? "Open AI assistant" : "Abrir assistente de IA"}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">{isEnglish ? "Ask AI" : "Perguntar à IA"}</span>
            </button>
          )}
        </div>
      </div>
    </TrelloDashboardLayout>
  );
}

type CardFilter = "all" | "mine" | "overdue" | "today";

function HeaderIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button onClick={onClick} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function MirrorSettingsModal({ isOpen, onClose, boardId }: { isOpen: boolean; onClose: () => void; boardId: number }) {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.boards.getMirrorSettings.useQuery({ boardId });
  const updateSettingsMutation = trpc.boards.updateMirrorSettings.useMutation();

  const handleToggle = async (key: string, value: boolean) => {
    if (!settings) return;
    
    const newSettings = {
      mirror_labels: settings.mirror_labels,
      mirror_checklists: settings.mirror_checklists,
      mirror_comments: settings.mirror_comments,
      mirror_attachments: settings.mirror_attachments,
      mirror_custom_fields: settings.mirror_custom_fields,
      mirror_dates: settings.mirror_dates,
      mirror_description: settings.mirror_description,
      [key]: value
    };

    try {
      await updateSettingsMutation.mutateAsync({
        boardId,
        settings: newSettings
      });
      utils.boards.getMirrorSettings.invalidate({ boardId });
      toast.success("Configuração atualizada");
    } catch (error) {
      toast.error("Erro ao atualizar configuração");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-popover text-foreground border-border max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-accent" />
            Configurações de Espelhamento
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Defina quais atributos serão sincronizados quando um cartão deste quadro for espelhado.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              {[
                { key: 'mirror_description', label: 'Descrição', icon: AlignLeft },
                { key: 'mirror_labels', label: 'Etiquetas', icon: Tag },
                { key: 'mirror_checklists', label: 'Checklists', icon: CheckSquare },
                { key: 'mirror_dates', label: 'Datas (Início/Entrega)', icon: Clock },
                { key: 'mirror_custom_fields', label: 'Campos Personalizados', icon: LayoutGrid },
                { key: 'mirror_comments', label: 'Comentários', icon: MessageSquare },
                { key: 'mirror_attachments', label: 'Anexos', icon: Paperclip },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface-3)] border border-[var(--surface-border)] hover:border-accent/30 transition-all">
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                  </div>
                  <Switch 
                    checked={(settings as any)?.[item.key]} 
                    onCheckedChange={(val) => handleToggle(item.key, val)}
                    className="data-[state=checked]:bg-accent"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShareModal({
  isOpen,
  onClose,
  boardId,
  isAdmin,
}: {
  isOpen: boolean;
  onClose: () => void;
  boardId: number;
  isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  // Evita chamadas proibidas quando o modal não está aberto.
  // Sem isso, `boards.getMembers`/`admin.users.list` podem disparar mesmo com `isOpen=false`
  // e gerar loops de render (além de erros FORBIDDEN).
  const { data: members } = trpc.boards.getMembers.useQuery(
    { boardId },
    { enabled: isOpen } as any
  );
  const { data: allUsers } = trpc.admin.users.list.useQuery(
    undefined,
    { enabled: isOpen && isAdmin } as any
  );
  const addMemberMutation = trpc.admin.boards.addMember.useMutation();
  const removeMemberMutation = trpc.admin.boards.removeMember.useMutation();

  const handleAddMember = async (userId: number) => {
    try {
      await addMemberMutation.mutateAsync({ boardId, userId, role: 'viewer' });
      toast.success("Membro adicionado");
      utils.boards.getMembers.invalidate({ boardId });
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar membro");
    }
  };

  const handleRemoveMember = async (userId: number) => {
    try {
      await removeMemberMutation.mutateAsync({ boardId, userId });
      toast.success("Membro removido");
      utils.boards.getMembers.invalidate({ boardId });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover membro");
    }
  };

  const memberIds = members?.map((m: any) => m.userId) || [];
  const nonMembers = allUsers?.filter((u: any) => !memberIds.includes(u.id)) || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        aria-describedby={undefined}
        className="max-w-md bg-popover border-border"
      >
        <DialogHeader>
          <DialogTitle>Compartilhar Quadro</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-4">
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> Membros Atuais
            </h4>
            <div className="space-y-2">
              {members?.length === 0 && <p className="text-xs text-muted-foreground">Apenas você tem acesso a este quadro.</p>}
              {members?.map((m: any) => (
                <div key={m.userId} className="flex items-center justify-between p-2 rounded bg-muted">
                  <span className="text-sm font-medium">{m.userName || `Usuário ${m.userId}`}</span>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMember(m.userId)}
                      className="text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div>
            <h4 className="text-sm font-semibold mb-3">Adicionar Novos Membros</h4>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
              {nonMembers.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between p-2 rounded border border-border hover:bg-muted transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{u.name || u.username}</span>
                    <span className="text-xs text-muted-foreground">{u.username}</span>
                  </div>
                  <Button size="sm" onClick={() => handleAddMember(u.id)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    Convidar
                  </Button>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ArchivedCardsModal({ isOpen, onClose, boardId }: { isOpen: boolean, onClose: () => void, boardId: number }) {
  const utils = trpc.useUtils();
  const { data: archivedCards, isLoading } = trpc.cards.getArchivedByBoard.useQuery({ boardId });
  const unarchiveMutation = trpc.cardDetails.archiveCard.useMutation();
  const deleteMutation = trpc.cards.delete.useMutation();

  const handleUnarchive = async (cardId: number) => {
    try {
      await unarchiveMutation.mutateAsync({ id: cardId, archived: false });
      utils.cards.getArchivedByBoard.invalidate({ boardId });
      utils.cards.getByList.invalidate();
      toast.success("Cartão restaurado");
    } catch (error) {
      toast.error("Erro ao restaurar cartão");
    }
  };

  const handleDelete = async (cardId: number) => {
    if (!confirm("Excluir permanentemente este cartão?")) return;
    try {
      await deleteMutation.mutateAsync({ id: cardId });
      utils.cards.getArchivedByBoard.invalidate({ boardId });
      toast.success("Cartão excluído");
    } catch (error) {
      toast.error("Erro ao excluir cartão");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        aria-describedby={undefined}
        className="max-w-2xl bg-popover border-border text-foreground"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-accent" />
            Itens Arquivados
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : archivedCards?.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Nenhum cartão arquivado neste quadro.</p>
          ) : (
            archivedCards?.map((card: any) => (
              <div key={card.id} className="flex items-center justify-between p-4 rounded-xl bg-[var(--surface-3)] border border-[var(--surface-border)] group hover:border-accent/30 transition-all">
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm text-foreground truncate">{card.title}</h4>
                  <p className="text-[10px] text-muted-foreground mt-1">Arquivado em: {new Date(card.updated_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleUnarchive(card.id)}
                    className="text-xs h-8 bg-[var(--surface-2)] hover:bg-accent hover:text-accent-foreground"
                  >
                    Restaurar
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDelete(card.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BoardActivityModal({ isOpen, onClose, boardName, logs, isLoading }: { isOpen: boolean, onClose: () => void, boardName: string, logs: any[], isLoading: boolean }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        aria-describedby={undefined}
        className="max-w-2xl bg-popover border-border text-foreground"
      >
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <HistoryIcon className="w-5 h-5 text-accent" />
              Atividades do Quadro
            </DialogTitle>
            <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-1 bg-accent/10 text-accent rounded border border-accent/20">
              {boardName}
            </span>
          </div>
          <DialogDescription className="text-muted-foreground text-xs mt-1">
            Histórico recente de ações realizadas neste quadro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-6 max-h-[65vh] overflow-y-auto custom-scrollbar pr-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-accent/50" />
              <p className="text-xs text-muted-foreground font-medium animate-pulse uppercase tracking-widest">Carregando atividades...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-[var(--surface-3)] flex items-center justify-center border border-[var(--surface-border)]">
                <Clock className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-tight">Nenhuma atividade recente</p>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-widest mt-1">Os logs aparecerão aqui conforme as ações ocorrerem.</p>
              </div>
            </div>
          ) : (
            logs?.map((log: any) => (
              <div key={log.id} className="flex gap-4 p-4 rounded-2xl bg-[var(--surface-3)]/50 border border-[var(--surface-border)] hover:border-accent/20 transition-all group">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-semibold uppercase tracking-tighter shadow-inner group-hover:bg-accent group-hover:text-accent-foreground transition-all duration-300">
                    {log.users?.name?.substring(0, 2) || "S"}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-foreground group-hover:text-foreground transition-colors">
                      {log.users?.name || "Sistema"}
                    </p>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest whitespace-nowrap bg-[var(--surface-1)] px-2 py-0.5 rounded border border-[var(--surface-border)]">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-[4px] text-[9px] font-semibold uppercase tracking-[0.1em] border",
                      log.action === 'create' && "bg-green-500/10 text-green-500 border-green-500/20",
                      log.action === 'update' && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                      log.action === 'delete' && "bg-red-500/10 text-red-500 border-red-500/20",
                      log.action === 'archive' && "bg-orange-500/10 text-orange-500 border-orange-500/20",
                      log.action === 'restore' && "bg-purple-500/10 text-purple-500 border-purple-500/20",
                    )}>
                      {log.action}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter truncate">
                      {log.entity_type}: {log.entity_name}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground italic line-clamp-2 leading-relaxed font-medium border-l-2 border-[var(--surface-border)] pl-3 py-1 group-hover:border-accent/40 group-hover:text-foreground/80 transition-all">
                    {log.details}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListColumn({
  listId,
  listName,
  boardId,
  query,
  filter,
  currentUserName,
  highlightField,
}: {
  listId: number;
  listName: string;
  boardId: number;
  query: string;
  filter: CardFilter;
  currentUserName: string;
  highlightField?: string;
}) {
  const { data: cards, isLoading } = trpc.cards.getByList.useQuery({ listId });
  const utils = trpc.useUtils();
  const deleteListMutation = trpc.lists.delete.useMutation();
  const updateListMutation = trpc.lists.update.useMutation();
  const createCardMutation = trpc.cards.create.useMutation();
  const { language } = useLanguage();
  const isEnglish = language === "en";

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(listName);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [showNewCard, setShowNewCard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { setNodeRef, isOver } = useDroppable({ id: `list-${listId}` });

  const allCards = (cards as CardWithUser[] | undefined) || [];
  const visibleCards = useMemo(() => {
    const text = query.trim().toLowerCase();
    const now = new Date();
    return allCards.filter((card) => {
      if (text) {
        const haystack = `${card.title} ${card.description || ""} ${(card.labels || []).map((l) => l.label).join(" ")} ${card.assignedToName || ""} ${Object.values(card.fields || {}).join(" ")}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      if (filter === "mine") return !!currentUserName && card.assignedToName === currentUserName;
      if (filter === "overdue" || filter === "today") {
        if (!card.dueDate) return false;
        const due = new Date(card.dueDate);
        const sameDay = due.toDateString() === now.toDateString();
        return filter === "today" ? sameDay : due < now && !sameDay;
      }
      return true;
    });
  }, [allCards, query, filter, currentUserName]);
  const isFiltered = visibleCards.length !== allCards.length;

  // Virtualizador para os cartões
  const rowVirtualizer = useVirtualizer({
    count: visibleCards.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96, // Altura estimada do card
    overscan: 5,
  });

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleDeleteList = async () => {
    if (!confirm("Tem certeza que deseja excluir esta lista e todos os seus cartões?")) return;
    try {
      await deleteListMutation.mutateAsync({ id: listId });
      toast.success("Lista removida");
      utils.lists.getByBoard.invalidate();
    } catch (error) {
      toast.error("Erro ao remover lista");
    }
  };

  const handleUpdateName = async () => {
    if (!editedName.trim() || editedName === listName) {
      setIsEditingName(false);
      setEditedName(listName);
      return;
    }
    try {
      await updateListMutation.mutateAsync({ id: listId, name: editedName });
      setIsEditingName(false);
      utils.lists.getByBoard.invalidate();
    } catch (error) {
      toast.error("Erro ao renomear lista");
    }
  };

  const handleCreateCard = async () => {
    if (!newCardTitle.trim() || createCardMutation.isPending) return;
    try {
      await createCardMutation.mutateAsync({
        listId,
        title: newCardTitle.trim(),
      });
      // Mantém o formulário aberto para criar vários cartões em sequência.
      setNewCardTitle("");
      utils.cards.getByList.invalidate({ listId });
    } catch (error) {
      toast.error(isEnglish ? "Could not create the card" : "Não foi possível criar o cartão");
    }
  };

  const cardIds = visibleCards.map((card) => `card-${card.id}-${listId}`);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex max-h-full w-[min(292px,calc(100vw-3.5rem))] flex-shrink-0 snap-start flex-col rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-1)] transition-colors",
        isOver && "border-primary/50"
      )}
    >
      <div className="flex items-center gap-1 px-2.5 pb-1 pt-2.5">
        {isEditingName ? (
          <input
            ref={inputRef}
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleUpdateName}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUpdateName();
              if (e.key === "Escape") {
                setEditedName(listName);
                setIsEditingName(false);
              }
            }}
            className="h-7 w-full rounded-md border border-ring bg-[var(--surface-2)] px-2 text-sm font-semibold text-foreground outline-none ring-2 ring-ring/25"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingName(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-foreground/[0.05]"
            title={isEnglish ? "Click to rename" : "Clique para renomear"}
          >
            <h2 className="truncate text-sm font-semibold text-foreground">{listName}</h2>
            <span className="flex-shrink-0 rounded-full bg-foreground/[0.08] px-1.5 text-[11px] font-semibold leading-5 text-muted-foreground">
              {isFiltered ? `${visibleCards.length}/${allCards.length}` : allCards.length}
            </span>
          </button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowNewCard(true)}
          className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={isEnglish ? "Add a card" : "Adicionar um cartão"}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground" aria-label={isEnglish ? "List options" : "Opções da lista"}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditingName(true)}>
              <Edit2 className="h-4 w-4" /> {isEnglish ? "Rename" : "Renomear"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDeleteList} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" /> {isEnglish ? "Delete list" : "Excluir lista"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div ref={scrollRef} className="thin-scroll min-h-[12px] flex-1 overflow-y-auto px-2 pt-1">
        {isLoading ? (
          <div className="space-y-2 pb-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-foreground/[0.06]" />
            ))}
          </div>
        ) : visibleCards.length === 0 && !showNewCard ? (
          <p className="px-2 pb-3 pt-1 text-xs text-muted-foreground">
            {isFiltered
              ? isEnglish ? "No cards match the filter." : "Nenhum cartão corresponde ao filtro."
              : isEnglish ? "No cards yet." : "Nenhum cartão ainda."}
          </p>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const card = visibleCards[virtualRow.index];
                if (!card) return null;
                return (
                  <div
                    key={card.id}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: "8px", // Espaçamento entre cards
                    }}
                  >
                    <DraggableCard
                      id={card.id}
                      listId={listId}
                      boardId={boardId}
                      title={card.title}
                      description={card.description || undefined}
                      startDate={card.startDate ? new Date(card.startDate) : undefined}
                      dueDate={card.dueDate ? new Date(card.dueDate) : undefined}
                      listName={listName}
                      assignedToName={card.assignedToName}
                      labels={card.labels}
                      checklistCount={card.checklistCount}
                      completedChecklistCount={card.completedChecklistCount}
                      attachmentCount={card.attachmentCount}
                      highlight={highlightField ? { label: highlightField, value: card.fields?.[highlightField] || "" } : null}
                    />
                  </div>
                );
              })}
            </SortableContext>
          </div>
        )}
      </div>

      <div className="p-2 pt-1">
        {showNewCard ? (
          <div>
            <textarea
              placeholder={isEnglish ? "Card title…" : "Título do cartão…"}
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              className="mb-2 w-full resize-none rounded-xl border border-ring bg-[var(--surface-2)] p-2.5 text-[13.5px] text-foreground outline-none ring-2 ring-ring/25 placeholder:text-muted-foreground"
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCreateCard();
                }
                if (e.key === "Escape") setShowNewCard(false);
              }}
            />
            <div className="flex items-center gap-2">
              <Button onClick={handleCreateCard} disabled={createCardMutation.isPending} size="sm" className="h-8">
                {isEnglish ? "Add card" : "Adicionar"}
              </Button>
              <Button onClick={() => setShowNewCard(false)} variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={isEnglish ? "Cancel" : "Cancelar"}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewCard(true)}
            className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            {isEnglish ? "Add a card" : "Adicionar um cartão"}
          </button>
        )}
      </div>
    </div>
  );
}
