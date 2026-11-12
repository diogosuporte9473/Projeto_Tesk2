import { AlertTriangle, CheckCircle2, Info, Loader2, OctagonAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { themeIcon } from "@/lib/themeIcons";
import { getBoardTheme, valueTone } from "@shared/boardThemes";
import type { Breakdown, Stat } from "@shared/boardMetrics";

/** Cores das duas séries do gráfico semanal (validadas para claro e escuro). */
export const SERIES = { created: "#0891b2", done: "#8b5cf6" };

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatStat(value: number, format: Stat["format"] = "count") {
  if (format === "currency") return currency.format(value);
  if (format === "percent") return `${decimal.format(value)}%`;
  if (format === "days") return value < 1 ? `${decimal.format(value * 24)} h` : `${decimal.format(value)} d`;
  if (format === "points") return `${decimal.format(value)} pts`;
  return decimal.format(value);
}

const TONE_ICON = { good: CheckCircle2, warning: AlertTriangle, critical: OctagonAlert } as const;
const TONE_TEXT = {
  good: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
} as const;

export function StatTile({ stat }: { stat: Stat }) {
  const Icon = stat.tone ? TONE_ICON[stat.tone] : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4" title={stat.hint}>
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {Icon && <Icon className={cn("h-3.5 w-3.5", TONE_TEXT[stat.tone!])} />}
        {stat.label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatStat(stat.value, stat.format)}</p>
      {stat.hint && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{stat.hint}</p>}
    </div>
  );
}

const STATUS_BAR: Record<ReturnType<typeof valueTone>, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#0284c7",
  neutral: "#64748b",
};

/** Barras horizontais: uma medida, uma cor; o valor fica escrito ao lado. */
export function BarList({ breakdown, color = SERIES.created }: { breakdown: Breakdown; color?: string }) {
  const max = Math.max(...breakdown.items.map((i) => i.value), 1);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{breakdown.title}</h3>
      <ul className="mt-3 space-y-2">
        {breakdown.items.map((item) => (
          <li
            key={item.label}
            className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-[13px]"
            title={`${item.label}: ${formatStat(item.value, breakdown.format)}`}
          >
            <span className="truncate text-muted-foreground group-hover:text-foreground">{item.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%`,
                  backgroundColor: breakdown.kind === "status" ? STATUS_BAR[valueTone(item.label)] : color,
                }}
              />
            </span>
            <span className="min-w-[2ch] text-right font-medium tabular-nums text-foreground">{formatStat(item.value, breakdown.format)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Criadas x concluídas por semana: duas séries, barras lado a lado. */
export function WeeklyChart({ weekly }: { weekly: { weekStart: string; created: number; done: number }[] }) {
  const max = Math.max(...weekly.flatMap((w) => [w.created, w.done]), 1);
  const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const empty = weekly.every((w) => w.created === 0 && w.done === 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Evolução nas últimas {weekly.length} semanas</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES.created }} /> Criadas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES.done }} /> Concluídas
          </span>
        </div>
      </div>
      {empty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma tarefa criada ou concluída no período.</p>
      ) : (
        <div className="mt-4 flex h-36 items-end gap-2 border-b border-border">
          {weekly.map((week) => (
            <div
              key={week.weekStart}
              className="flex h-full flex-1 items-end justify-center gap-[2px] rounded-t hover:bg-foreground/[0.04]"
              title={`Semana de ${label(week.weekStart)} — criadas: ${week.created}, concluídas: ${week.done}`}
            >
              {(["created", "done"] as const).map((series) => (
                <span
                  key={series}
                  className="w-1/3 max-w-[18px] rounded-t-[4px]"
                  style={{ height: `${(week[series] / max) * 100}%`, minHeight: week[series] > 0 ? 3 : 0, backgroundColor: SERIES[series] }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex gap-2">
        {weekly.map((week) => (
          <span key={week.weekStart} className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {label(week.weekStart)}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        "Concluídas" usa a data da última atualização do cartão concluído; o sistema ainda não guarda a data exata de conclusão.
      </p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Ver em tabela</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr>
              <th className="py-1 font-medium">Semana de</th>
              <th className="py-1 font-medium">Criadas</th>
              <th className="py-1 font-medium">Concluídas</th>
            </tr>
          </thead>
          <tbody>
            {weekly.map((week) => (
              <tr key={week.weekStart} className="border-t border-border">
                <td className="py-1">{label(week.weekStart)}</td>
                <td className="py-1">{week.created}</td>
                <td className="py-1">{week.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Painel de indicadores de um quadro (aba "Painel" e painel geral). */
export default function BoardDashboard({ boardId }: { boardId: number }) {
  const { data, isLoading, error } = trpc.stats.board.useQuery({ boardId }, { refetchOnWindowFocus: false } as any);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !data) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Não foi possível carregar os indicadores deste quadro.</p>;
  }

  const theme = getBoardTheme(data.theme);
  const Icon = themeIcon(theme);

  return (
    <div className="space-y-6">
      {data.totals.total === 0 && (
        <p className="rounded-xl border border-dashed border-input px-4 py-3 text-sm text-muted-foreground">
          Este quadro ainda não tem cartões; os indicadores aparecem conforme o trabalho for registrado.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visão geral</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {data.general.map((stat) => (
            <StatTile key={stat.key} stat={{ ...stat, hint: undefined }} />
          ))}
        </div>
      </section>

      {data.segment.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Icon className="h-3.5 w-3.5" style={{ color: theme.palette.primary }} />
            Indicadores de {theme.name}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {data.segment.map((stat) => (
              <StatTile key={stat.key} stat={stat} />
            ))}
          </div>
        </section>
      )}

      <WeeklyChart weekly={data.weekly} />

      {data.breakdowns.length > 0 && (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.breakdowns.map((breakdown) => (
            <BarList key={breakdown.key} breakdown={breakdown} />
          ))}
        </section>
      )}

      {data.unavailable.length > 0 && (
        <section className="rounded-2xl border border-border p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Info className="h-4 w-4 text-muted-foreground" /> Indicadores ainda não disponíveis
          </h3>
          <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
            {data.unavailable.map((item) => (
              <li key={item.label}>
                <span className="font-medium text-foreground">{item.label}:</span> {item.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
