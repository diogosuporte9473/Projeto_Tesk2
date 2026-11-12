/**
 * Indicadores de um quadro, calculados só a partir de dados reais:
 * listas, cartões e campos do segmento. Função pura (sem banco), usada
 * pelo servidor e coberta por testes.
 *
 * Quando um indicador não pode ser medido com os dados que o sistema
 * guarda hoje, ele entra em `unavailable` com o motivo, em vez de ser
 * estimado ou simulado.
 */
import { getBoardTheme, type BoardThemeKey } from "./boardThemes.js";

export interface MetricCard {
  id: number;
  listId: number;
  title: string;
  status?: string | null;
  dueDate?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  assignedToName?: string | null;
  fields?: Record<string, string>;
}

export interface MetricList {
  id: number;
  name: string;
  position?: number | null;
}

export interface Stat {
  key: string;
  label: string;
  value: number;
  /** Como o valor é exibido. */
  format?: "count" | "currency" | "percent" | "days" | "points";
  /** De onde o número vem, em linguagem simples. */
  hint?: string;
  tone?: "good" | "warning" | "critical";
}

export interface Breakdown {
  key: string;
  title: string;
  items: { label: string; value: number }[];
  format?: Stat["format"];
  /** "status": rótulos de severidade recebem cor de estado. */
  kind?: "magnitude" | "status";
}

export interface BoardMetrics {
  theme: BoardThemeKey;
  themeName: string;
  totals: { total: number; done: number; pending: number; overdue: number; unassigned: number };
  general: Stat[];
  segment: Stat[];
  breakdowns: Breakdown[];
  weekly: { weekStart: string; created: number; done: number }[];
  unavailable: { label: string; reason: string }[];
}

const DAY = 86400000;
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const time = (v: unknown): number | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};
const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  const plain = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(plain) ? plain : Number.isFinite(n) ? n : 0;
};

function countBy<T>(items: T[], pick: (item: T) => string | null | undefined, emptyLabel?: string) {
  const map = new Map<string, number>();
  for (const item of items) {
    const raw = pick(item);
    const label = raw && String(raw).trim() ? String(raw).trim() : emptyLabel;
    if (!label) continue;
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function mondayOf(t: number) {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
}

export function computeBoardMetrics(input: {
  theme: unknown;
  lists: MetricList[];
  cards: MetricCard[];
  now?: Date;
  weeks?: number;
}): BoardMetrics {
  const theme = getBoardTheme(input.theme);
  const now = (input.now ?? new Date()).getTime();
  const today = new Date(now).toDateString();
  const lists = [...input.lists].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const listName = new Map(lists.map((l) => [l.id, l.name]));
  const doneNames = new Set(theme.doneLists.map(norm));
  const cards = input.cards;

  const inList = (card: MetricCard, ...names: string[]) => names.map(norm).includes(norm(listName.get(card.listId)));
  const isDone = (card: MetricCard) => card.status === "completed" || doneNames.has(norm(listName.get(card.listId)));
  const isOverdue = (card: MetricCard) => {
    const due = time(card.dueDate);
    return due !== null && !isDone(card) && due < now && new Date(due).toDateString() !== today;
  };
  const field = (card: MetricCard, key: string) => card.fields?.[key] ?? "";

  const done = cards.filter(isDone);
  const open = cards.filter((c) => !isDone(c));
  const overdue = cards.filter(isOverdue);
  const unassigned = open.filter((c) => !c.assignedToName);

  const totals = {
    total: cards.length,
    done: done.length,
    pending: open.length,
    overdue: overdue.length,
    unassigned: unassigned.length,
  };

  const general: Stat[] = [
    { key: "total", label: "Tarefas", value: totals.total, hint: "Cartões não arquivados do quadro" },
    { key: "done", label: "Concluídas", value: totals.done, tone: "good", hint: `Marcadas como concluídas ou nas listas: ${theme.doneLists.join(", ")}` },
    { key: "pending", label: "Pendentes", value: totals.pending },
    { key: "overdue", label: "Atrasadas", value: totals.overdue, tone: totals.overdue > 0 ? "critical" : undefined, hint: "Prazo vencido e ainda não concluídas" },
    { key: "unassigned", label: "Sem responsável", value: totals.unassigned, tone: totals.unassigned > 0 ? "warning" : undefined, hint: "Pendentes sem responsável" },
  ];

  const breakdowns: Breakdown[] = [
    {
      key: "byList",
      title: "Por etapa",
      items: lists.map((l) => ({ label: l.name, value: cards.filter((c) => c.listId === l.id).length })),
    },
    { key: "byAssignee", title: "Pendentes por responsável", items: countBy(open, (c) => c.assignedToName, "Sem responsável") },
  ];

  // Evolução semanal. "Concluídas" usa a data da última atualização do
  // cartão concluído: o sistema ainda não guarda a data exata de conclusão.
  const weeksCount = input.weeks ?? 8;
  const firstWeek = mondayOf(now) - (weeksCount - 1) * 7 * DAY;
  const weekly = Array.from({ length: weeksCount }, (_, i) => ({
    weekStart: new Date(firstWeek + i * 7 * DAY).toISOString().slice(0, 10),
    created: 0,
    done: 0,
  }));
  const bucket = (t: number | null) => (t === null || t < firstWeek ? -1 : Math.min(weeksCount - 1, Math.floor((t - firstWeek) / (7 * DAY))));
  for (const card of cards) {
    const created = bucket(time(card.createdAt));
    if (created >= 0) weekly[created].created++;
    if (isDone(card)) {
      const finished = bucket(time(card.updatedAt));
      if (finished >= 0) weekly[finished].done++;
    }
  }

  const segment: Stat[] = [];
  const unavailable: BoardMetrics["unavailable"] = [];
  const sum = (items: MetricCard[], key: string) => items.reduce((total, c) => total + num(field(c, key)), 0);
  const avgDays = (items: MetricCard[], from: (c: MetricCard) => number | null, to: (c: MetricCard) => number | null) => {
    const spans = items.map((c) => [from(c), to(c)] as const).filter(([a, b]) => a !== null && b !== null && b! >= a!);
    return { n: spans.length, value: spans.length ? spans.reduce((t, [a, b]) => t + (b! - a!) / DAY, 0) / spans.length : 0 };
  };

  if (theme.key === "siem") {
    const critical = open.filter((c) => norm(field(c, "Severidade")) === "crítica");
    const investigating = cards.filter((c) => inList(c, "Em investigação", "Análise técnica"));
    const mttr = avgDays(cards, (c) => time(field(c, "Data da detecção")), (c) => time(field(c, "Data de resolução")));
    segment.push(
      { key: "open", label: "Incidentes abertos", value: open.length },
      { key: "critical", label: "Críticos abertos", value: critical.length, tone: critical.length ? "critical" : undefined },
      { key: "criticalUnassigned", label: "Críticos sem responsável", value: critical.filter((c) => !c.assignedToName).length, tone: critical.some((c) => !c.assignedToName) ? "critical" : undefined },
      { key: "investigating", label: "Em investigação", value: investigating.length, hint: "Nas listas Em investigação e Análise técnica" },
      { key: "resolved", label: "Resolvidos", value: done.length },
      { key: "falsePositive", label: "Falsos positivos", value: cards.filter((c) => norm(field(c, "Resultado")) === "falso positivo").length }
    );
    if (mttr.n > 0) {
      segment.push({ key: "mttr", label: "MTTR", value: mttr.value, format: "days", hint: `Média entre Data da detecção e Data de resolução (${mttr.n} incidente(s) com as duas datas)` });
    } else {
      unavailable.push({ label: "MTTR — tempo médio para resolução", reason: "Preencha Data da detecção e Data de resolução nos incidentes." });
    }
    unavailable.push(
      { label: "MTTA — tempo médio para reconhecimento", reason: "O sistema ainda não registra o momento do reconhecimento (previsto com o SLA)." },
      { label: "SLA cumprido / violado", reason: "Depende das regras de SLA (fase de automações)." },
      { label: "Incidentes recorrentes", reason: "Depende de deduplicação de eventos (fase de integrações)." }
    );
    breakdowns.push(
      { key: "bySeverity", title: "Abertos por severidade", kind: "status", items: orderBy(countBy(open, (c) => field(c, "Severidade"), "Não classificada"), ["Crítica", "Alta", "Média", "Baixa", "Informativa", "Não classificada"]) },
      { key: "byTool", title: "Por ferramenta de detecção", items: countBy(cards, (c) => field(c, "Ferramenta de detecção")) },
      { key: "byType", title: "Por tipo de ocorrência", items: countBy(cards, (c) => field(c, "Tipo de ocorrência")) },
      { key: "byAsset", title: "Ativos mais afetados", items: countBy(cards, (c) => field(c, "Ativo afetado") || field(c, "Hostname")).slice(0, 8) }
    );
  }

  if (theme.key === "crm") {
    const won = cards.filter((c) => inList(c, "Ganho"));
    const lost = cards.filter((c) => inList(c, "Perdido"));
    const pipeline = cards.filter((c) => !inList(c, "Ganho", "Perdido") && c.status !== "completed");
    const closed = won.length + lost.length;
    const followUps = pipeline.filter((c) => {
      const next = time(field(c, "Próximo contato"));
      return next !== null && next <= now;
    });
    const negotiation = avgDays(won, (c) => time(c.createdAt), (c) => time(c.updatedAt));
    segment.push(
      { key: "leads", label: "Leads recebidos", value: cards.length },
      { key: "qualified", label: "Leads qualificados", value: cards.filter((c) => !inList(c, "Novo lead", "Perdido")).length, hint: "Passaram da lista Novo lead" },
      { key: "openDeals", label: "Oportunidades abertas", value: pipeline.length },
      { key: "pipeline", label: "Valor do pipeline", value: sum(pipeline, "Valor da oportunidade"), format: "currency", hint: "Soma de Valor da oportunidade das abertas" },
      { key: "won", label: "Vendas ganhas", value: won.length, tone: "good" },
      { key: "wonValue", label: "Valor ganho", value: sum(won, "Valor da oportunidade"), format: "currency" },
      { key: "lost", label: "Vendas perdidas", value: lost.length },
      { key: "followUps", label: "Follow-ups pendentes", value: followUps.length, tone: followUps.length ? "warning" : undefined, hint: "Próximo contato vencido ou para hoje" }
    );
    if (closed > 0) segment.push({ key: "conversion", label: "Taxa de conversão", value: (won.length / closed) * 100, format: "percent", hint: "Ganhas ÷ (ganhas + perdidas)" });
    else unavailable.push({ label: "Taxa de conversão", reason: "Ainda não há oportunidades nas listas Ganho ou Perdido." });
    if (negotiation.n > 0) segment.push({ key: "negotiation", label: "Tempo médio de negociação", value: negotiation.value, format: "days", hint: "Da criação até a última atualização das vendas ganhas" });
    breakdowns.push(
      { key: "bySource", title: "Por origem do lead", items: countBy(cards, (c) => field(c, "Origem do lead")) },
      { key: "lossReasons", title: "Motivos de perda", items: countBy(lost, (c) => field(c, "Motivo de perda")) }
    );
  }

  if (theme.key === "ecommerce") {
    const cat = (name: string) => open.filter((c) => norm(field(c, "Categoria")) === norm(name)).length;
    const resolution = avgDays(done, (c) => time(c.createdAt), (c) => time(c.updatedAt));
    segment.push(
      { key: "orders", label: "Pedidos pendentes", value: cat("Pedidos") },
      { key: "stock", label: "Atividades de estoque", value: cat("Gestão de estoque") },
      { key: "integration", label: "Problemas de integração", value: cat("Integração de marketplaces") },
      { key: "returns", label: "Devoluções em andamento", value: cat("Devoluções") },
      { key: "logistics", label: "Pendências logísticas", value: cat("Logística") + cat("Entregas") },
      { key: "campaigns", label: "Campanhas em execução", value: cat("Campanhas") + cat("Marketing") },
      { key: "value", label: "Valor envolvido (pendentes)", value: sum(open, "Valor envolvido"), format: "currency" }
    );
    if (resolution.n > 0) segment.push({ key: "resolution", label: "Tempo médio de resolução", value: resolution.value, format: "days", hint: "Da criação até a última atualização das concluídas" });
    breakdowns.push(
      { key: "byCategory", title: "Pendentes por categoria", items: countBy(open, (c) => field(c, "Categoria"), "Sem categoria") },
      { key: "byMarketplace", title: "Por marketplace", items: countBy(cards, (c) => field(c, "Marketplace")) }
    );
  }

  if (theme.key === "dev") {
    const type = (c: MetricCard) => norm(field(c, "Tipo de atividade"));
    const bugs = open.filter((c) => type(c) === "bug" || type(c) === "hotfix");
    const cycle = avgDays(done, (c) => time(c.createdAt), (c) => time(c.updatedAt));
    segment.push(
      { key: "doneTasks", label: "Tarefas concluídas", value: done.length, tone: "good" },
      { key: "bugs", label: "Bugs abertos", value: bugs.length, tone: bugs.length ? "warning" : undefined, hint: "Tipo de atividade Bug ou Hotfix, não concluídos" },
      { key: "hotfix", label: "Hotfix abertos", value: bugs.filter((c) => type(c) === "hotfix").length, tone: bugs.some((c) => type(c) === "hotfix") ? "critical" : undefined },
      { key: "debt", label: "Débito técnico", value: open.filter((c) => type(c) === "débito técnico").length },
      { key: "review", label: "Em Code Review", value: cards.filter((c) => inList(c, "Code Review")).length },
      { key: "pointsDone", label: "Story points entregues", value: sum(done, "Story Points"), format: "points" },
      { key: "pointsOpen", label: "Story points pendentes", value: sum(open, "Story Points"), format: "points" }
    );
    if (cycle.n > 0) segment.push({ key: "leadTime", label: "Lead time", value: cycle.value, format: "days", hint: "Da criação até a última atualização das concluídas" });
    unavailable.push(
      { label: "Cycle time e Burndown", reason: "O sistema ainda não guarda quando o cartão entrou em cada etapa." },
      { label: "Velocidade da sprint", reason: "Depende do cadastro de sprints com datas (hoje Sprint é um campo de texto)." }
    );
    breakdowns.push(
      { key: "byType", title: "Por tipo de atividade", items: countBy(cards, (c) => field(c, "Tipo de atividade"), "Sem tipo") },
      { key: "bySprint", title: "Story points por sprint", format: "points", items: sumBy(cards, (c) => field(c, "Sprint"), (c) => num(field(c, "Story Points"))) },
      { key: "byVersion", title: "Entregas por versão", items: countBy(done, (c) => field(c, "Versão")) }
    );
  }

  return {
    theme: theme.key,
    themeName: theme.name,
    totals,
    general,
    segment,
    breakdowns: breakdowns.filter((b) => b.items.length > 0),
    weekly,
    unavailable,
  };
}

function orderBy(items: { label: string; value: number }[], order: string[]) {
  const rank = (label: string) => {
    const i = order.findIndex((o) => norm(o) === norm(label));
    return i === -1 ? order.length : i;
  };
  return [...items].sort((a, b) => rank(a.label) - rank(b.label));
}

function sumBy<T>(items: T[], pick: (item: T) => string, value: (item: T) => number) {
  const map = new Map<string, number>();
  for (const item of items) {
    const label = pick(item).trim();
    if (!label) continue;
    map.set(label, (map.get(label) || 0) + value(item));
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, value: v }))
    .filter((i) => i.value > 0)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** Soma os totais de vários quadros (painel geral). */
export function sumTotals(all: BoardMetrics["totals"][]): BoardMetrics["totals"] {
  return all.reduce(
    (acc, t) => ({
      total: acc.total + t.total,
      done: acc.done + t.done,
      pending: acc.pending + t.pending,
      overdue: acc.overdue + t.overdue,
      unassigned: acc.unassigned + t.unassigned,
    }),
    { total: 0, done: 0, pending: 0, overdue: 0, unassigned: 0 }
  );
}
