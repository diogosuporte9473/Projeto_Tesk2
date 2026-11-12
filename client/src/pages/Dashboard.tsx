import { useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Loader2 } from "lucide-react";
import TrelloDashboardLayout from "@/components/TrelloDashboardLayout";
import BoardDashboard, { BarList, StatTile, WeeklyChart } from "@/components/BoardDashboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { themeIcon } from "@/lib/themeIcons";
import { getBoardTheme } from "@shared/boardThemes";
import type { Stat } from "@shared/boardMetrics";

const ALL = "all";

/** Painel geral: visão consolidada dos quadros que o usuário acessa. */
export default function Dashboard() {
  const { data, isLoading, error } = trpc.stats.overview.useQuery(undefined, { refetchOnWindowFocus: false } as any);
  const [selected, setSelected] = useState<string>(ALL);

  const tiles: Stat[] = data
    ? [
        { key: "boards", label: "Quadros", value: data.totalBoards },
        { key: "total", label: "Tarefas", value: data.totals.total },
        { key: "done", label: "Concluídas", value: data.totals.done, tone: "good" },
        { key: "pending", label: "Pendentes", value: data.totals.pending },
        { key: "overdue", label: "Atrasadas", value: data.totals.overdue, tone: data.totals.overdue > 0 ? "critical" : undefined },
        { key: "unassigned", label: "Sem responsável", value: data.totals.unassigned, tone: data.totals.unassigned > 0 ? "warning" : undefined },
      ]
    : [];

  return (
    <TrelloDashboardLayout>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Indicadores calculados com os cartões dos quadros que você acessa.
            </p>
          </div>
          {data && data.boards.length > 0 && (
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-9 w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os quadros</SelectItem>
                {data.boards.map((board) => (
                  <SelectItem key={board.boardId} value={String(board.boardId)}>
                    {board.boardName} · {board.themeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error || !data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Não foi possível carregar o painel.</p>
        ) : data.boards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-input px-4 py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem quadros. Crie um para começar a acompanhar os indicadores.
          </p>
        ) : selected !== ALL ? (
          <BoardDashboard boardId={Number(selected)} />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {tiles.map((stat) => (
                <StatTile key={stat.key} stat={stat} />
              ))}
            </div>

            <WeeklyChart weekly={data.weekly} />

            <section className="rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Quadros</h2>
                <p className="text-xs text-muted-foreground">
                  Cada quadro aparece com o seu segmento; os indicadores específicos ficam no painel do quadro.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Quadro</th>
                      <th className="px-2 py-2 font-medium">Segmento</th>
                      <th className="px-2 py-2 text-right font-medium">Tarefas</th>
                      <th className="px-2 py-2 text-right font-medium">Pendentes</th>
                      <th className="px-2 py-2 text-right font-medium">Atrasadas</th>
                      <th className="px-4 py-2 font-medium">Concluído</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.boards.map((board) => {
                      const theme = getBoardTheme(board.theme);
                      const Icon = themeIcon(theme);
                      const pct = board.totals.total ? Math.round((board.totals.done / board.totals.total) * 100) : 0;
                      return (
                        <tr key={board.boardId} className="border-t border-border hover:bg-foreground/[0.03]">
                          <td className="px-4 py-2.5">
                            <Link href={`/board/${board.boardId}`} className="inline-flex items-center gap-2 font-medium hover:underline">
                              <span className="h-3 w-3 flex-shrink-0 rounded-[4px]" style={{ backgroundColor: board.color || "var(--primary)" }} />
                              <span className="truncate">{board.boardName}</span>
                              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </Link>
                            {board.tenantName && <span className="ml-5 block text-[11px] text-muted-foreground">{board.tenantName}</span>}
                          </td>
                          <td className="px-2 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <Icon className="h-3.5 w-3.5" style={{ color: theme.palette.primary }} />
                              {board.themeName}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{board.totals.total}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{board.totals.pending}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">
                            {board.totals.overdue > 0 ? (
                              <span className="font-semibold text-red-600 dark:text-red-400">{board.totals.overdue}</span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-foreground/[0.08]">
                                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                              </span>
                              <span className="tabular-nums text-muted-foreground">{pct}%</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {data.byAssignee.length > 0 && (
              <BarList breakdown={{ key: "byAssignee", title: "Pendentes por responsável (todos os quadros)", items: data.byAssignee.slice(0, 12) }} />
            )}
          </div>
        )}
      </div>
    </TrelloDashboardLayout>
  );
}
