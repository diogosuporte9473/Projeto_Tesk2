import { describe, expect, it } from "vitest";
import { computeBoardMetrics, sumTotals, type MetricCard } from "../shared/boardMetrics.js";

const NOW = new Date("2026-11-12T12:00:00Z");
const day = (offset: number) => new Date(NOW.getTime() + offset * 86400000).toISOString();

const card = (id: number, listId: number, extra: Partial<MetricCard> = {}): MetricCard => ({
  id,
  listId,
  title: `Cartão ${id}`,
  status: "open",
  createdAt: day(-10),
  updatedAt: day(-1),
  ...extra,
});

describe("computeBoardMetrics — totais gerais", () => {
  const lists = [
    { id: 1, name: "A fazer", position: 0 },
    { id: 2, name: "Em andamento", position: 1 },
    { id: 3, name: "Concluído", position: 2 },
  ];
  const cards = [
    card(1, 1, { dueDate: day(-2), assignedToName: "Ana" }), // atrasada
    card(2, 1, { dueDate: day(3) }), // no prazo, sem responsável
    card(3, 2, { status: "completed", dueDate: day(-5), assignedToName: "Ana" }), // concluída pelo status
    card(4, 3, { dueDate: day(-5), assignedToName: "Rui" }), // concluída pela lista
    card(5, 2, { dueDate: NOW.toISOString(), assignedToName: "Rui" }), // vence hoje: não é atraso
  ];
  const m = computeBoardMetrics({ theme: "general", lists, cards, now: NOW });

  it("conta concluídas pelo status ou pela lista final, e atraso só do que está pendente", () => {
    expect(m.totals).toEqual({ total: 5, done: 2, pending: 3, overdue: 1, unassigned: 1 });
  });

  it("distribui por etapa e por responsável sem inventar dados", () => {
    expect(m.breakdowns.find((b) => b.key === "byList")!.items).toEqual([
      { label: "A fazer", value: 2 },
      { label: "Em andamento", value: 2 },
      { label: "Concluído", value: 1 },
    ]);
    expect(m.breakdowns.find((b) => b.key === "byAssignee")!.items).toEqual([
      { label: "Ana", value: 1 },
      { label: "Rui", value: 1 },
      { label: "Sem responsável", value: 1 },
    ]);
    expect(m.segment).toEqual([]);
  });

  it("monta a evolução semanal com as datas reais dos cartões", () => {
    expect(m.weekly).toHaveLength(8);
    expect(m.weekly.reduce((t, w) => t + w.created, 0)).toBe(5);
    expect(m.weekly.reduce((t, w) => t + w.done, 0)).toBe(2);
  });

  it("quadro vazio devolve zeros", () => {
    const empty = computeBoardMetrics({ theme: "general", lists, cards: [], now: NOW });
    expect(empty.totals).toEqual({ total: 0, done: 0, pending: 0, overdue: 0, unassigned: 0 });
  });
});

describe("computeBoardMetrics — SIEM", () => {
  const lists = [
    { id: 1, name: "Novo alerta", position: 0 },
    { id: 2, name: "Em investigação", position: 1 },
    { id: 3, name: "Resolvido", position: 2 },
  ];
  const cards = [
    card(1, 1, { fields: { Severidade: "Crítica", "Ferramenta de detecção": "EDR" } }),
    card(2, 2, { assignedToName: "Ana", fields: { Severidade: "Alta", "Ferramenta de detecção": "EDR", Hostname: "FIN-022" } }),
    card(3, 3, { fields: { Severidade: "Crítica", Resultado: "Falso positivo", "Data da detecção": "2026-11-01T10:00", "Data de resolução": "2026-11-03" } }),
  ];
  const m = computeBoardMetrics({ theme: "siem", lists, cards, now: NOW });
  const stat = (key: string) => m.segment.find((s) => s.key === key)?.value;

  it("mede críticos abertos, sem responsável, investigação e falsos positivos", () => {
    expect(stat("open")).toBe(2);
    expect(stat("critical")).toBe(1); // o crítico resolvido não conta
    expect(stat("criticalUnassigned")).toBe(1);
    expect(stat("investigating")).toBe(1);
    expect(stat("resolved")).toBe(1);
    expect(stat("falsePositive")).toBe(1);
  });

  it("calcula MTTR só com incidentes que têm as duas datas", () => {
    expect(stat("mttr")).toBeGreaterThan(1);
    expect(stat("mttr")).toBeLessThan(2);
    const semDatas = computeBoardMetrics({ theme: "siem", lists, cards: cards.slice(0, 2), now: NOW });
    expect(semDatas.segment.find((s) => s.key === "mttr")).toBeUndefined();
    expect(semDatas.unavailable.map((u) => u.label).join()).toContain("MTTR");
  });

  it("declara como indisponível o que o sistema ainda não mede", () => {
    const labels = m.unavailable.map((u) => u.label).join();
    expect(labels).toContain("MTTA");
    expect(labels).toContain("SLA");
  });

  it("ordena severidade do mais grave ao menos grave", () => {
    expect(m.breakdowns.find((b) => b.key === "bySeverity")!.items.map((i) => i.label)).toEqual(["Crítica", "Alta"]);
    expect(m.breakdowns.find((b) => b.key === "byTool")!.items).toEqual([{ label: "EDR", value: 2 }]);
  });
});

describe("computeBoardMetrics — CRM e DEV", () => {
  it("CRM: pipeline, conversão e follow-ups", () => {
    const lists = [
      { id: 1, name: "Novo lead" },
      { id: 2, name: "Em negociação" },
      { id: 3, name: "Ganho" },
      { id: 4, name: "Perdido" },
    ];
    const cards = [
      card(1, 1, { fields: { "Valor da oportunidade": "1000" } }),
      card(2, 2, { fields: { "Valor da oportunidade": "2500,50", "Próximo contato": "2026-11-10" } }),
      card(3, 3, { fields: { "Valor da oportunidade": "4000" } }),
      card(4, 4, { fields: { "Motivo de perda": "Preço" } }),
    ];
    const m = computeBoardMetrics({ theme: "crm", lists, cards, now: NOW });
    const stat = (key: string) => m.segment.find((s) => s.key === key)?.value;
    expect(stat("openDeals")).toBe(2);
    expect(stat("pipeline")).toBeCloseTo(3500.5);
    expect(stat("wonValue")).toBe(4000);
    expect(stat("conversion")).toBe(50);
    expect(stat("followUps")).toBe(1);
    expect(stat("qualified")).toBe(2);
    expect(m.totals.done).toBe(2); // Ganho e Perdido encerram a oportunidade
  });

  it("DEV: bugs abertos e story points", () => {
    const lists = [
      { id: 1, name: "Em desenvolvimento" },
      { id: 2, name: "Code Review" },
      { id: 3, name: "Concluído" },
    ];
    const cards = [
      card(1, 1, { fields: { "Tipo de atividade": "Bug", "Story Points": "3", Sprint: "Sprint 2" } }),
      card(2, 2, { fields: { "Tipo de atividade": "Feature", "Story Points": "5", Sprint: "Sprint 2" } }),
      card(3, 3, { fields: { "Tipo de atividade": "Bug", "Story Points": "2", Sprint: "Sprint 1" } }),
    ];
    const m = computeBoardMetrics({ theme: "dev", lists, cards, now: NOW });
    const stat = (key: string) => m.segment.find((s) => s.key === key)?.value;
    expect(stat("bugs")).toBe(1);
    expect(stat("review")).toBe(1);
    expect(stat("pointsDone")).toBe(2);
    expect(stat("pointsOpen")).toBe(8);
    expect(m.breakdowns.find((b) => b.key === "bySprint")!.items).toEqual([
      { label: "Sprint 1", value: 2 },
      { label: "Sprint 2", value: 8 },
    ]);
  });
});

describe("sumTotals", () => {
  it("soma os totais de vários quadros", () => {
    expect(
      sumTotals([
        { total: 3, done: 1, pending: 2, overdue: 1, unassigned: 0 },
        { total: 2, done: 2, pending: 0, overdue: 0, unassigned: 0 },
      ])
    ).toEqual({ total: 5, done: 3, pending: 2, overdue: 1, unassigned: 0 });
  });
});
