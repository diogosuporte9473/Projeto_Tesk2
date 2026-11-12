import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de autorização (isolamento por tenant).
 * O Supabase é substituído por tabelas em memória: nada toca o banco real.
 */
const { tables, fakeSupabase, dataClientSignIn, authClientSignIn, createAuthClient } = vi.hoisted(() => {
  const tables: Record<string, any[]> = {};
  const state = { seq: 90000 };

  class Query {
    private filters: Array<(row: any) => boolean> = [];
    private op: "select" | "delete" | "update" = "select";
    private patch: any = null;
    private inserted: any[] | null = null;
    constructor(private table: string) {}

    select() { return this; }
    order() { return this; }
    range() { return this; }
    eq(col: string, val: any) { this.filters.push((r) => r[col] === val); return this; }
    is(col: string, val: any) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
    in(col: string, vals: any[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
    or() { this.filters.push(() => false); return this; }
    delete() { this.op = "delete"; return this; }
    update(patch: any) { this.op = "update"; this.patch = patch; return this; }
    insert(row: any) {
      const rows = (Array.isArray(row) ? row : [row]).map((r) => ({ ...r }));
      for (const r of rows) {
        if (r.id == null) r.id = ++state.seq;
        if (r.created_at == null) r.created_at = new Date().toISOString();
      }
      (tables[this.table] ||= []).push(...rows);
      this.inserted = rows;
      return this;
    }
    upsert(row: any, options?: { onConflict?: string }) {
      const keys = (options?.onConflict || "").split(",").map((k) => k.trim()).filter(Boolean);
      if (keys.length > 0) {
        const rows = Array.isArray(row) ? row : [row];
        tables[this.table] = (tables[this.table] || []).filter(
          (existing) => !rows.some((r) => keys.every((k) => existing[k] === r[k]))
        );
      }
      return this.insert(row);
    }

    private run() {
      if (this.inserted) return this.inserted;
      const all = tables[this.table] || [];
      const matched = all.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "delete") tables[this.table] = all.filter((r) => !matched.includes(r));
      if (this.op === "update") matched.forEach((r) => Object.assign(r, this.patch));
      return matched;
    }
    maybeSingle() { return Promise.resolve({ data: this.run()[0] ?? null, error: null }); }
    single() { return this.maybeSingle(); }
    then(resolve: any, reject: any) {
      const data = this.run();
      return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
    }
  }

  // Cliente de dados (service role): login nele trocaria a identidade das consultas.
  const dataClientSignIn = vi.fn();
  const fakeSupabase = {
    from: (table: string) => new Query(table),
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: dataClientSignIn,
      signUp: dataClientSignIn,
    },
  };
  // Cliente descartável usado só para autenticar.
  const authClientSignIn = vi.fn(async () => ({
    data: { session: { access_token: "user-jwt", expires_in: 3600 } },
    error: null,
  }));
  const createAuthClient = vi.fn(() => ({ auth: { signInWithPassword: authClientSignIn } }));
  return { tables, fakeSupabase, dataClientSignIn, authClientSignIn, createAuthClient };
});

vi.mock("./_core/supabase.js", () => ({ supabase: fakeSupabase, createAuthClient }));

import { appRouter } from "./routers.js";
import { assertAccess } from "./_core/access.js";

const TENANT_A = "aaaaaaaa-0000-0000-0000-000000000001";
const TENANT_B = "bbbbbbbb-0000-0000-0000-000000000002";

function seed() {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.users = [
    { id: 1, username: "alice", role: "user", tenant_id: TENANT_A },
    { id: 2, username: "admin-a", role: "admin", tenant_id: TENANT_A },
    { id: 3, username: "bob", role: "user", tenant_id: TENANT_B },
    { id: 4, username: "admin-b", role: "admin", tenant_id: TENANT_B },
    { id: 5, username: "root", role: "master_admin", tenant_id: TENANT_A },
    { id: 6, username: "novato", role: "user", tenant_id: null },
  ];
  tables.boards = [
    { id: 10, name: "Quadro A", owner_id: 1, tenant_id: TENANT_A },
    { id: 20, name: "Quadro B", owner_id: 3, tenant_id: TENANT_B },
  ];
  tables.lists = [
    { id: 100, board_id: 10, tenant_id: TENANT_A, name: "Lista A" },
    { id: 200, board_id: 20, tenant_id: TENANT_B, name: "Lista B" },
  ];
  tables.cards = [
    { id: 1000, list_id: 100, tenant_id: TENANT_A, title: "Cartão A", archived: false },
    { id: 2000, list_id: 200, tenant_id: TENANT_B, title: "Cartão B", archived: false },
  ];
  tables.card_attachments = [
    { id: 5000, card_id: 1000 },
    { id: 6000, card_id: 2000 },
  ];
  tables.card_checklists = [
    { id: 7000, card_id: 1000, position: 0 },
    { id: 8000, card_id: 2000, position: 0 },
  ];
  tables.board_mirror_settings = [{ board_id: 20, mirror_labels: true }];
}

function callerFor(userId: number) {
  const row = tables.users.find((u) => u.id === userId)!;
  const user: any = { id: row.id, username: row.username, role: row.role, tenantId: row.tenant_id };
  return appRouter.createCaller({
    user,
    tenantId: user.tenantId,
    req: { protocol: "https", headers: {} },
    res: { cookie: () => {}, clearCookie: () => {} },
  } as any);
}

beforeEach(seed);

describe("assertAccess", () => {
  const alice: any = { id: 1, role: "user", tenantId: TENANT_A };

  it("permite recursos do próprio tenant em qualquer nível", async () => {
    await expect(assertAccess(alice, "board", 10)).resolves.toBeUndefined();
    await expect(assertAccess(alice, "list", 100)).resolves.toBeUndefined();
    await expect(assertAccess(alice, "card", 1000)).resolves.toBeUndefined();
    await expect(assertAccess(alice, "card_attachments", 5000)).resolves.toBeUndefined();
  });

  it("nega recursos de outro tenant em qualquer nível", async () => {
    await expect(assertAccess(alice, "board", 20)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assertAccess(alice, "list", 200)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assertAccess(alice, "card", 2000)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assertAccess(alice, "card_attachments", 6000)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assertAccess(alice, "user", 3)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("nega tudo a usuário sem tenant e libera master_admin", async () => {
    const novato: any = { id: 6, role: "user", tenantId: null };
    const root: any = { id: 5, role: "master_admin", tenantId: TENANT_A };
    await expect(assertAccess(novato, "board", 10)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assertAccess(root, "card", 2000)).resolves.toBeUndefined();
  });

  it("rejeita IDs que não são números", async () => {
    await expect(assertAccess(alice, "card", "1000" as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("rotas protegidas por tenant", () => {
  it("lists.delete não apaga lista de outro tenant", async () => {
    await expect(callerFor(1).lists.delete({ id: 200 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tables.lists.some((l) => l.id === 200)).toBe(true);

    await callerFor(1).lists.delete({ id: 100 });
    expect(tables.lists.some((l) => l.id === 100)).toBe(false);
  });

  it("cardDetails.deleteAttachment não apaga anexo de outro tenant", async () => {
    await expect(callerFor(1).cardDetails.deleteAttachment({ id: 6000 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tables.card_attachments.some((a) => a.id === 6000)).toBe(true);
  });

  it("cardDetails.reorderChecklist valida todos os itens antes de alterar", async () => {
    await expect(
      callerFor(1).cardDetails.reorderChecklist({ items: [{ id: 7000, position: 9 }, { id: 8000, position: 9 }] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tables.card_checklists.find((c) => c.id === 7000).position).toBe(0);
    expect(tables.card_checklists.find((c) => c.id === 8000).position).toBe(0);
  });

  it("boardMirrorSettings não lê nem altera quadro de outro tenant", async () => {
    await expect(callerFor(2).boardMirrorSettings.get({ boardId: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerFor(2).boardMirrorSettings.update({ boardId: 20, settings: { mirror_labels: false } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Usuário comum do próprio tenant também não altera.
    await expect(
      callerFor(1).boardMirrorSettings.update({ boardId: 10, settings: { mirror_labels: false } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.users", () => {
  it("admin de um tenant não altera nem remove usuário de outro tenant", async () => {
    await expect(callerFor(2).admin.users.update({ id: 3, role: "admin" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(2).admin.users.delete({ id: 3 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tables.users.find((u) => u.id === 3).role).toBe("user");
  });

  it("admin altera papel de usuário do próprio tenant", async () => {
    await callerFor(2).admin.users.update({ id: 1, role: "admin" });
    expect(tables.users.find((u) => u.id === 1).role).toBe("admin");
  });

  it("admin de tenant não altera nem remove master_admin", async () => {
    await expect(callerFor(2).admin.users.update({ id: 5, name: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(2).admin.users.delete({ id: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tables.users.some((u) => u.id === 5)).toBe(true);
  });

  it("ninguém altera o próprio papel", async () => {
    await callerFor(1).admin.users.update({ id: 1, role: "admin" });
    expect(tables.users.find((u) => u.id === 1).role).toBe("user");
    await callerFor(2).admin.users.update({ id: 2, role: "user" });
    expect(tables.users.find((u) => u.id === 2).role).toBe("admin");
  });

  it("usuário comum não remove ninguém", async () => {
    await expect(callerFor(1).admin.users.delete({ id: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("tenant.create", () => {
  it("é recusado para quem já pertence a um ambiente", async () => {
    await expect(callerFor(1).tenant.create({ name: "Outro ambiente" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("auth.login", () => {
  it("autentica em um cliente descartável, nunca no cliente de dados", async () => {
    const user = await callerFor(1).auth.login({ username: "alice", password: "segredo" });
    expect(user.username).toBe("alice");
    expect(createAuthClient).toHaveBeenCalledTimes(1);
    expect(authClientSignIn).toHaveBeenCalledTimes(1);
    expect(dataClientSignIn).not.toHaveBeenCalled();
  });
});

describe("boards.setTheme (tema por quadro)", () => {
  it("usuário comum que não é dono não altera o tema", async () => {
    // Quadro 10 pertence à alice (id 1); o admin-a (id 2) pode, um colega comum não.
    tables.users.push({ id: 7, username: "carol", role: "user", tenant_id: TENANT_A });
    await expect(callerFor(7).boards.setTheme({ id: 10, theme: "siem" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tables.boards.find((b) => b.id === 10).theme).toBeUndefined();
  });

  it("admin de outro tenant não enxerga o quadro", async () => {
    await expect(callerFor(4).boards.setTheme({ id: 10, theme: "crm" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("troca o tema sem tocar nos cartões e cria só as listas que faltam", async () => {
    tables.lists.push({ id: 101, board_id: 10, tenant_id: TENANT_A, name: "triagem", position: 1 });
    const cardsBefore = JSON.stringify(tables.cards);

    const result = await callerFor(1).boards.setTheme({
      id: 10,
      theme: "siem",
      createSuggestedLists: true,
      settings: { detectionTools: [" Wazuh ", "wazuh", "", "Firewall X"] },
    });

    const board = tables.boards.find((b) => b.id === 10);
    expect(board.theme).toBe("siem");
    // Lista editável: sem vazios nem repetidos.
    expect(board.settings.detectionTools).toEqual(["Wazuh", "Firewall X"]);
    // Cartões intactos.
    expect(JSON.stringify(tables.cards)).toBe(cardsBefore);
    // "Triagem" já existia (com outra caixa): não é duplicada; "Lista A" permanece.
    const names = tables.lists.filter((l) => l.board_id === 10).map((l) => l.name);
    expect(names.filter((n) => n.toLowerCase() === "triagem")).toHaveLength(1);
    expect(names).toContain("Lista A");
    expect(names).toContain("Novo alerta");
    expect(result.createdLists).not.toContain("Triagem");
    // Listas de outro quadro não mudam.
    expect(tables.lists.filter((l) => l.board_id === 20)).toHaveLength(1);
  });

  it("trocar de tema de novo preserva os ajustes do tema anterior", async () => {
    await callerFor(2).boards.setTheme({ id: 10, theme: "siem", settings: { detectionTools: ["EDR"] } });
    await callerFor(2).boards.setTheme({ id: 10, theme: "dev" });
    const board = tables.boards.find((b) => b.id === 10);
    expect(board.theme).toBe("dev");
    expect(board.settings.detectionTools).toEqual(["EDR"]);
    // Sem createSuggestedLists nenhuma lista é criada.
    expect(tables.lists.filter((l) => l.board_id === 10)).toHaveLength(1);
  });

  it("rejeita tema desconhecido", async () => {
    await expect(callerFor(1).boards.setTheme({ id: 10, theme: "financeiro" as any })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("cardDetails.upsertCustomField (campos do tema)", () => {
  beforeEach(() => {
    const board = tables.boards.find((b) => b.id === 10);
    board.theme = "siem";
    board.settings = { detectionTools: ["EDR", "Firewall X"] };
  });

  it("valida número, data e opção de seleção dos campos do tema", async () => {
    const save = (fieldName: string, fieldValue: string) =>
      callerFor(1).cardDetails.upsertCustomField({ cardId: 1000, fieldName, fieldValue });

    await expect(save("Severidade", "Gravíssima")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(save("Ferramenta de detecção", "Outra")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(save("Data de resolução", "amanhã")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(tables.card_custom_fields || []).toHaveLength(0);

    await save("Severidade", "Crítica");
    await save("Ferramenta de detecção", "Firewall X"); // nome editado pelo usuário no quadro
    await save("Data de resolução", "2026-11-20");
    await save("Hostname", "FIN-022");
    expect(tables.card_custom_fields.map((f: any) => f.field_value)).toEqual(["Crítica", "Firewall X", "2026-11-20", "FIN-022"]);
  });

  it("aceita limpar o campo e não restringe campos fora do tema", async () => {
    await callerFor(1).cardDetails.upsertCustomField({ cardId: 1000, fieldName: "Severidade", fieldValue: "" });
    await callerFor(1).cardDetails.upsertCustomField({ cardId: 1000, fieldName: "Mapa de Calor", fieldValue: "Qualquer" });
    expect(tables.card_custom_fields).toHaveLength(2);
  });

  it("não grava campo em cartão de outro tenant", async () => {
    await expect(
      callerFor(1).cardDetails.upsertCustomField({ cardId: 2000, fieldName: "Severidade", fieldValue: "Alta" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("stats (indicadores por quadro)", () => {
  it("stats.board calcula com os cartões do quadro e nega quadro de outro tenant", async () => {
    const own = await callerFor(1).stats.board({ boardId: 10 });
    expect(own.totals.total).toBe(1);
    expect(own.boardName).toBe("Quadro A");
    await expect(callerFor(1).stats.board({ boardId: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stats.overview nunca inclui quadros de outro tenant", async () => {
    const overview = await callerFor(1).stats.overview();
    expect(overview.boards.map((b) => b.boardId)).not.toContain(20);
    expect(overview.totals.total).toBe(overview.boards.reduce((t, b) => t + b.totals.total, 0));
  });
});

describe("automations (Fase 4)", () => {
  const criticalRule = {
    name: "Crítico: avisar admins",
    trigger: { type: "field_changed" as const, field: "Severidade" },
    conditions: [{ field: "Severidade", op: "eq" as const, value: "Crítica" }],
    actions: [{ type: "notify" as const, target: "admins" as const, message: "Incidente crítico" }],
  };

  beforeEach(() => {
    const board = tables.boards.find((b) => b.id === 10);
    board.theme = "siem";
    board.settings = {};
    tables.lists.push({ id: 101, board_id: 10, tenant_id: TENANT_A, name: "Contenção", position: 1 });
  });

  it("só o dono do quadro ou um admin da empresa cria regras", async () => {
    tables.users.push({ id: 7, username: "carol", role: "user", tenant_id: TENANT_A });
    await expect(callerFor(7).automations.create({ boardId: 10, rule: criticalRule })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(4).automations.create({ boardId: 10, rule: criticalRule })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tables.automations || []).toHaveLength(0);
    await callerFor(1).automations.create({ boardId: 10, rule: criticalRule }); // dona
    await callerFor(2).automations.create({ boardId: 10, rule: criticalRule }); // admin
    expect(tables.automations).toHaveLength(2);
  });

  it("campo alterado + condição: notifica só os admins da própria empresa", async () => {
    await callerFor(2).automations.create({ boardId: 10, rule: criticalRule });

    await callerFor(1).cardDetails.upsertCustomField({ cardId: 1000, fieldName: "Severidade", fieldValue: "Alta" });
    expect(tables.notifications || []).toHaveLength(0); // condição não atendida

    await callerFor(1).cardDetails.upsertCustomField({ cardId: 1000, fieldName: "Severidade", fieldValue: "Crítica" });
    expect(tables.notifications.map((n: any) => n.user_id)).toEqual([2]); // admin-a; nunca o admin-b (id 4)
    expect(tables.notifications[0].tenant_id).toBe(TENANT_A);
    expect(tables.automation_runs).toHaveLength(1);
    expect(tables.automation_runs[0]).toMatchObject({ status: "ok", card_id: 1000 });
  });

  it("regra desativada não roda", async () => {
    const { id } = await callerFor(2).automations.create({ boardId: 10, rule: criticalRule });
    await callerFor(2).automations.update({ boardId: 10, id, enabled: false });
    await callerFor(1).cardDetails.upsertCustomField({ cardId: 1000, fieldName: "Severidade", fieldValue: "Crítica" });
    expect(tables.notifications || []).toHaveLength(0);
  });

  it("cartão movido para a lista: cria o checklist uma única vez", async () => {
    await callerFor(2).automations.create({
      boardId: 10,
      rule: {
        name: "Procedimento de contenção",
        trigger: { type: "card_moved", list: "contenção" },
        conditions: [],
        actions: [{ type: "add_checklist", title: "Resposta", items: ["Isolar", "Preservar evidências"] }],
      },
    });
    await callerFor(1).cardDetails.moveCard({ cardId: 1000, targetListId: 101 });
    expect(tables.card_checklist_groups.filter((g: any) => g.card_id === 1000)).toHaveLength(1);
    expect(tables.card_checklists.filter((i: any) => i.card_id === 1000 && i.group_id != null).map((i: any) => i.title)).toEqual(["Isolar", "Preservar evidências"]);

    await callerFor(1).cardDetails.moveCard({ cardId: 1000, targetListId: 100 });
    await callerFor(1).cardDetails.moveCard({ cardId: 1000, targetListId: 101 });
    expect(tables.card_checklist_groups.filter((g: any) => g.card_id === 1000)).toHaveLength(1);
  });

  it("ação com erro não derruba a ação do usuário e fica no histórico", async () => {
    await callerFor(2).automations.create({
      boardId: 10,
      rule: { name: "Mover para lista inexistente", trigger: { type: "card_completed" }, conditions: [], actions: [{ type: "move_to_list", list: "Não existe" }] },
    });
    await expect(callerFor(1).cardDetails.updateStatus({ cardId: 1000, status: "completed" })).resolves.toMatchObject({ success: true });
    expect(tables.cards.find((c) => c.id === 1000).status).toBe("completed");
    expect(tables.automation_runs[0].status).toBe("error");
  });

  it("não aceita atribuir cartão a usuário de outra empresa", async () => {
    await expect(
      callerFor(2).automations.create({
        boardId: 10,
        rule: { name: "Atribuir", trigger: { type: "card_created" }, conditions: [], actions: [{ type: "assign", userId: 3 }] },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("admin de outro tenant não altera nem apaga regra pelo id", async () => {
    const { id } = await callerFor(2).automations.create({ boardId: 10, rule: criticalRule });
    await callerFor(4).automations.update({ boardId: 20, id, enabled: false });
    await callerFor(4).automations.delete({ boardId: 20, id });
    expect(tables.automations.find((a: any) => a.id === id)).toMatchObject({ enabled: true });
  });

  it("gatilho de tempo: roda uma vez por cartão e respeita o intervalo", async () => {
    tables.cards.find((c) => c.id === 1000).due_date = new Date(Date.now() - 86400000).toISOString();
    await callerFor(2).automations.create({
      boardId: 10,
      rule: { name: "Atrasados", trigger: { type: "overdue" }, conditions: [], actions: [{ type: "notify", target: "owner" }] },
    });
    expect(await callerFor(1).automations.runScheduled({ boardId: 10 })).toEqual({ ran: 1 });
    expect(tables.notifications.map((n: any) => n.user_id)).toEqual([1]); // dona do quadro
    expect(await callerFor(1).automations.runScheduled({ boardId: 10 })).toEqual({ ran: 0 });
    expect(tables.notifications).toHaveLength(1);
  });

  it("notificações: cada usuário vê e marca só as suas", async () => {
    tables.notifications = [
      { id: 1, user_id: 1, tenant_id: TENANT_A, title: "Para alice", read: false, created_at: new Date().toISOString() },
      { id: 2, user_id: 3, tenant_id: TENANT_B, title: "Para bob", read: false, created_at: new Date().toISOString() },
    ];
    const mine = await callerFor(1).notifications.list();
    expect(mine.items.map((n) => n.title)).toEqual(["Para alice"]);
    expect(mine.unread).toBe(1);
    await callerFor(1).notifications.markAllRead();
    expect(tables.notifications.map((n: any) => n.read)).toEqual([true, false]);
  });
});

describe("empresa do recurso (multi-tenant)", () => {
  beforeEach(() => {
    tables.tenants = [{ id: TENANT_A, name: "Empresa A" }, { id: TENANT_B, name: "Empresa B" }];
    // Como em produção: o master_admin aponta para uma empresa que não existe mais.
    tables.users.find((u) => u.id === 5).tenant_id = "cccccccc-0000-0000-0000-000000000003";
  });

  it("master_admin precisa escolher a empresa e o quadro nasce nela", async () => {
    await expect(callerFor(5).boards.create({ name: "Sem empresa" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { id } = await callerFor(5).boards.create({ name: "Quadro do master", tenantId: TENANT_B, theme: "crm" });
    expect(tables.boards.find((b) => b.id === id)).toMatchObject({ tenant_id: TENANT_B, theme: "crm" });
    const created = tables.lists.filter((l) => l.board_id === id);
    expect(created.length).toBeGreaterThan(1);
    expect(created.every((l) => l.tenant_id === TENANT_B)).toBe(true);
  });

  it("usuário comum não cria quadro em outra empresa", async () => {
    await expect(callerFor(1).boards.create({ name: "Invasão", tenantId: TENANT_B })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { id } = await callerFor(1).boards.create({ name: "Meu quadro" });
    expect(tables.boards.find((b) => b.id === id).tenant_id).toBe(TENANT_A);
  });

  it("lista, cartão e comentário criados pelo master herdam a empresa do quadro", async () => {
    await callerFor(5).lists.create({ boardId: 20, name: "Nova lista" });
    expect(tables.lists.find((l) => l.name === "Nova lista").tenant_id).toBe(TENANT_B);

    const { id } = await callerFor(5).cards.create({ listId: 200, title: "Cartão do master" });
    expect(tables.cards.find((c) => c.id === id).tenant_id).toBe(TENANT_B);

    await callerFor(5).cardDetails.addComment({ cardId: 2000, content: "ok" });
    expect(tables.card_comments[0].tenant_id).toBe(TENANT_B);
  });
});
