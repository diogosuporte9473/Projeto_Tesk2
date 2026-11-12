import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useEffect } from "react";
import { Clock, CalendarDays, AlignLeft, CheckSquare, Paperclip } from "lucide-react";
import { format, isBefore, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import CardDetailModal from "./CardDetailModal";
import { valueTone } from "@shared/boardThemes";

const TONE_CLASS: Record<ReturnType<typeof valueTone>, string> = {
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  low: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  neutral: "bg-foreground/[0.07] text-muted-foreground",
};

interface Label {
  id: number;
  label: string;
  color: string;
}

interface DraggableCardProps {
  id: number;
  listId: number;
   // Opcional: usado para buscar membros do quadro no modal de detalhes
  boardId?: number;
  title: string;
  description?: string;
  startDate?: Date;
  dueDate?: Date;
  listName?: string;
  assignedToName?: string | null;
  labels?: Label[];
  checklistCount?: number;
  completedChecklistCount?: number;
  attachmentCount?: number;
  /** Selo do tema do quadro (ex.: Severidade: Crítica). */
  highlight?: { label: string; value: string } | null;
  onChecklistChange?: (completed: number, total: number) => void;
}

const AVATAR_COLORS = ["#0ea5e9", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#6366f1", "#14b8a6"];

/** Cor estável por pessoa, para reconhecer o responsável de relance. */
export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function DraggableCard({
  id,
  listId,
  boardId,
  title,
  description,
  startDate,
  dueDate,
  listName,
  assignedToName,
  labels = [],
  checklistCount: initialChecklistCount = 0,
  completedChecklistCount: initialCompletedCount = 0,
  attachmentCount = 0,
  highlight,
  onChecklistChange,
}: DraggableCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [counts, setCounts] = useState({
    completed: initialCompletedCount,
    total: initialChecklistCount
  });

  // Sincronizar quando as props mudarem (ex: refresh do tRPC)
  useEffect(() => {
    setCounts({
      completed: initialCompletedCount,
      total: initialChecklistCount
    });
  }, [initialCompletedCount, initialChecklistCount]);

  const handleLocalChecklistChange = (completed: number, total: number) => {
    setCounts({ completed, total });
    onChecklistChange?.(completed, total);
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `card-${id}-${listId}`, data: { title } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : 0,
  };

  const isOverdue = dueDate && isBefore(new Date(dueDate), new Date()) && !isToday(new Date(dueDate));
  const isDueToday = dueDate && isToday(new Date(dueDate));
  const checklistDone = counts.total > 0 && counts.completed === counts.total;
  const visibleLabels = labels.slice(0, 3);
  const hasFooter = Boolean(startDate || dueDate || description || counts.total > 0 || attachmentCount > 0 || assignedToName);

  return (
    <>
      <div ref={setNodeRef} style={style} className="group relative">
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => {
            e.stopPropagation();
            if (!isDragging) {
              setIsModalOpen(true);
            }
          }}
          className={cn(
            "task-card flex cursor-pointer flex-col gap-2 rounded-xl p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isDragging && "ring-2 ring-primary"
          )}
        >
          {/* Etiquetas */}
          {labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {visibleLabels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex max-w-[140px] items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold leading-4"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${label.color} 16%, transparent)`,
                    color: `color-mix(in srgb, ${label.color} 72%, var(--foreground))`,
                  }}
                  title={label.label}
                >
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="truncate">{label.label}</span>
                </span>
              ))}
              {labels.length > visibleLabels.length && (
                <span className="rounded-md bg-foreground/[0.07] px-1.5 py-0.5 text-[10.5px] font-semibold leading-4 text-muted-foreground">
                  +{labels.length - visibleLabels.length}
                </span>
              )}
            </div>
          )}

          {/* Selo do segmento */}
          {highlight?.value && (
            <span
              className={cn("inline-flex w-fit max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold leading-4", TONE_CLASS[valueTone(highlight.value)])}
              title={highlight.label}
            >
              <span className="truncate">{highlight.value}</span>
            </span>
          )}

          {/* Título */}
          <h3 className="text-[13.5px] font-medium leading-snug text-foreground">{title}</h3>

          {/* Progresso do checklist */}
          {counts.total > 0 && (
            <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
              <div
                className={cn("h-full rounded-full transition-all", checklistDone ? "bg-emerald-500" : "bg-primary")}
                style={{ width: `${Math.round((counts.completed / counts.total) * 100)}%` }}
              />
            </div>
          )}

          {/* Rodapé: prazo, indicadores e responsável */}
          {hasFooter && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-muted-foreground">
                {dueDate ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
                      isOverdue
                        ? "bg-red-500/12 text-red-500 dark:text-red-400"
                        : isDueToday
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-foreground/[0.06]"
                    )}
                    title={isOverdue ? "Atrasado" : isDueToday ? "Vence hoje" : "Entrega"}
                  >
                    <Clock size={11} />
                    {format(new Date(dueDate), "d MMM", { locale: ptBR })}
                  </span>
                ) : startDate ? (
                  <span className="inline-flex items-center gap-1" title="Início">
                    <CalendarDays size={11} />
                    {format(new Date(startDate), "d MMM", { locale: ptBR })}
                  </span>
                ) : null}
                {description && (
                  <span title="Tem descrição">
                    <AlignLeft size={12} />
                  </span>
                )}
                {counts.total > 0 && (
                  <span
                    className={cn("inline-flex items-center gap-1", checklistDone && "text-emerald-600 dark:text-emerald-400")}
                    title="Checklist"
                  >
                    <CheckSquare size={12} />
                    {counts.completed}/{counts.total}
                  </span>
                )}
                {attachmentCount > 0 && (
                  <span className="inline-flex items-center gap-1" title="Anexos">
                    <Paperclip size={12} />
                    {attachmentCount}
                  </span>
                )}
              </div>

              {assignedToName && (
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: avatarColor(assignedToName) }}
                  title={assignedToName}
                >
                  {initialsOf(assignedToName)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <CardDetailModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          cardId={id}
          cardTitle={title}
          cardDescription={description}
          listName={listName}
          boardId={boardId}
          onChecklistChange={handleLocalChecklistChange}
        />
      )}
    </>
  );
}
