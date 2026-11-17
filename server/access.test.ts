import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de autorização (isolamento por tenant).
 * O Supabase é substituído por tabelas em memória: nada toca o banco real.
 */
const { tables, fakeSupabase, dataClientSignIn, authClientSignIn, createAuthClient, authAdmin } = vi.hoisted(() => {
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
    neq(col: string, val: any) { this.filters.push((r) => r[col] !== val); return this; }
    ilike(col: string, pattern: string) {
      const wanted = String(pattern).replace(/\\([\\%_])/g, "$1").toLowerCase();
      this.filters.push((r) => String(r[col] ?? "").toLowerCase() === wanted);
      return this;
    }
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
      // Simula a chave estrangeira do histórico (audit_logs) barrando a exclusão.
      if (this.op === "delete" && this.table === "users" && authAdmin.blockUserDelete) {
        return Promise.resolve({ data: null, error: { message: "violates foreign key constraint" } }).then(resolve, reject);
      }
      const data = this.run();
      return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
    }
  }

  // Cliente de dados (service role): login nele trocaria a identidade das consultas.
  const dataClientSignIn = vi.fn();
  // Contas de login (Supabase Auth) em memória.
  const authAdmin = {
    accounts: [] as Array<{ id: string; email: string; password: string; user_metadata: any }>,
    failInsert: false,
    blockUserDelete: false,
    createUser: async ({ email, password, user_metadata }: any) => {
      if (authAdmin.accounts.some((a) => a.email === email)) {
        return { data: { user: null }, error: { message: "User already registered" } };
      }
      const account = { id: `auth-${authAdmin.accounts.length + 1}`, email, password, user_metadata };
      authAdmin.accounts.push(account);
      return { data: { user: account }, error: null };
    },
    deleteUser: async (id: string) => {
      authAdmin.accounts = authAdmin.accounts.filter((a) => a.id !== id);
      return { data: {}, error: null };
    },
    tokens: new Map<string, string>(),
    generateLink: async ({ type, email }: any) => {
      let account = authAdmin.accounts.find((a) => a.email === email);
      if (type === "invite") {
        if (account) return { data: { user: null, properties: null }, error: { message: "already been registered" } };
        account = { id: `auth-${authAdmin.accounts.length + 1}`, email, password: "", user_metadata: {} };
        authAdmin.accounts.push(account);
      } else if (!account) {
        return { data: { user: null, properties: null }, error: { message: "User not found" } };
      }
      const token = `token-${type}-${account.id}-${authAdmin.tokens.size + 1}-padding`;
      authAdmin.tokens.set(token, account.id);
      return { data: { user: account, properties: { action_link: `https://auth.test/verify?token=${token}` } }, error: null };
    },
    updateUserById: async (id: string, patch: any) => {
      const account = authAdmin.accounts.find((a) => a.id === id);
      if (account) Object.assign(account, patch);
      return { data: { user: account }, error: null };
    },
  };
  const fakeSupabase = {
    from: (table: string) => new Query(table),
    auth: {
      getUser: async (token?: string) => {
        const id = token ? authAdmin.tokens.get(token) : undefined;
        const account = id ? authAdmin.accounts.find((a) => a.id === id) : undefined;
        return account ? { data: { user: { id: account.id, email: account.email } }, error: null } : { data: { user: null }, error: { message: "invalid" } };
      },
      signInWithPassword: dataClientSignIn,
      signUp: dataClientSignIn,
      admin: authAdmin,
    },
  };
  // Cliente descartável usado só para autenticar.
  const authClientSignIn = vi.fn(async () => ({
    data: { session: { access_token: "user-jwt", expires_in: 3600 } },
    error: null,
  }));
  const createAuthClient = vi.fn(() => ({ auth: { signInWithPassword: authClientSignIn } }));
  return { tables, fakeSupabase, dataClientSignIn, authClientSignIn, createAuthClient, authAdmin };
});

vi.mock("./_core/supabase.js", () => ({ supabase: fakeSupabase, createAuthClient }));

// E-mails enviados ficam guardados aqui em vez de sair por SMTP.
const mail = vi.hoisted(() => ({ sent: [] as any[] }));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: async (message: any) => { mail.sent.push(message); return {}; } }) },
}));

import { appRouter } from "./routers.js";
import { assertAccess } from "./_core/access.js";

const TENANT_A = "aaaaaaaa-0000-0000-0000-000000000001";
const TENANT_B = "bbbbbbbb-0000-0000-0000-000000000002";

function seed() {
  for (const key of Object.keys(tables)) delete tables[key];
  authAdmin.accounts = [];
  authAdmin.tokens.clear();
  mail.sent = [];
  authAdmin.blockUserDelete = false;
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

describe("admin.users — cadastro segregado por empresa", () => {
  const SENHA = "frase longa de teste";

  beforeEach(() => {
    tables.tenants = [{ id: TENANT_A, name: "Empresa A" }, { id: TENANT_B, name: "Empresa B" }];
  });

  it("administrador cria usuário somente na própria empresa", async () => {
    const { id } = await callerFor(2).admin.users.create({ username: "Novo@A.com", password: SENHA, name: "Novo", role: "user" });
    const row = tables.users.find((u) => u.id === id);
    expect(row).toMatchObject({ username: "novo@a.com", tenant_id: TENANT_A, role: "user" });
    expect(tables.user_tenants.find((t) => t.user_id === id)).toMatchObject({ tenant_id: TENANT_A, role: "member" });

    await expect(
      callerFor(2).admin.users.create({ username: "invasor@b.com", password: SENHA, tenantId: TENANT_B })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tables.users.some((u) => u.username === "invasor@b.com")).toBe(false);
    expect(authAdmin.accounts.some((a) => a.email === "invasor@b.com")).toBe(false);
  });

  it("administrador define se o novo usuário é administrador ou comum", async () => {
    const { id } = await callerFor(2).admin.users.create({ username: "chefe@a.com", password: SENHA, role: "admin" });
    expect(tables.users.find((u) => u.id === id).role).toBe("admin");
    expect(tables.user_tenants.find((t) => t.user_id === id).role).toBe("admin");
  });

  it("ninguém cria super administrador por esta rota", async () => {
    await expect(
      callerFor(5).admin.users.create({ username: "raiz2@a.com", password: SENHA, role: "master_admin" as any, tenantId: TENANT_A })
    ).rejects.toBeTruthy();
    expect(tables.users.some((u) => u.username === "raiz2@a.com")).toBe(false);
  });

  it("super administrador escolhe a empresa e ela precisa existir", async () => {
    const { id } = await callerFor(5).admin.users.create({ username: "novo@b.com", password: SENHA, role: "admin", tenantId: TENANT_B });
    expect(tables.users.find((u) => u.id === id)).toMatchObject({ tenant_id: TENANT_B, role: "admin" });

    await expect(callerFor(5).admin.users.create({ username: "semempresa@x.com", password: SENHA })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callerFor(5).admin.users.create({ username: "fantasma@x.com", password: SENHA, tenantId: "cccccccc-0000-0000-0000-000000000003" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(authAdmin.accounts.map((a) => a.email)).toEqual(["novo@b.com"]);
  });

  it("usuário comum e usuário sem empresa não criam ninguém", async () => {
    await expect(callerFor(1).admin.users.create({ username: "x@a.com", password: SENHA })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(6).admin.users.create({ username: "y@a.com", password: SENHA })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(1).admin.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("aplica a política de senha e recusa login repetido", async () => {
    await expect(callerFor(2).admin.users.create({ username: "curta@a.com", password: "123456" })).rejects.toBeTruthy();
    await expect(
      callerFor(2).admin.users.create({ username: "mariana@a.com", password: "mariana-2026!" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(callerFor(2).admin.users.create({ username: "alice", password: SENHA })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(authAdmin.accounts).toHaveLength(0);
  });

  it("papel e empresa não vão para user_metadata e a criação é auditada", async () => {
    const { id } = await callerFor(2).admin.users.create({ username: "audit@a.com", password: SENHA, role: "admin" });
    expect(authAdmin.accounts[0].user_metadata).toEqual({ name: "audit@a.com" });
    expect(tables.audit_logs.find((l) => l.entity_type === "user" && l.entity_id === id)).toMatchObject({
      action: "create",
      tenant_id: TENANT_A,
      user_id: 2,
    });
  });

  it("listagem: administrador vê só a própria empresa, sem o super administrador", async () => {
    const listA = await callerFor(2).admin.users.list();
    expect(listA.map((u) => u.id).sort()).toEqual([1, 2]);
    const all = await callerFor(5).admin.users.list();
    expect(all.length).toBe(tables.users.length);
    expect(all.find((u) => u.id === 3)?.tenantName).toBe("Empresa B");
  });

  it("troca de senha e remoção alcançam a conta de login", async () => {
    const { id } = await callerFor(2).admin.users.create({ username: "sai@a.com", password: SENHA });
    await callerFor(2).admin.users.update({ id, password: "outra frase bem longa" });
    expect(authAdmin.accounts[0].password).toBe("outra frase bem longa");
    await callerFor(2).admin.users.delete({ id });
    expect(authAdmin.accounts).toHaveLength(0);
    expect(tables.users.some((u) => u.id === id)).toBe(false);
  });

  it("quadro só recebe membro da mesma empresa", async () => {
    await expect(callerFor(5).admin.boards.addMember({ boardId: 10, userId: 3, role: "viewer" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(callerFor(5).boards.addMember({ boardId: 10, userId: 3, role: "viewer" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await callerFor(2).admin.boards.addMember({ boardId: 10, userId: 1, role: "editor" });
    expect(tables.board_members.find((m) => m.board_id === 10 && m.user_id === 1)?.role).toBe("editor");
  });
});

describe("branding.deleteTenant", () => {
  const TENANT_C = "cccccccc-0000-4000-8000-000000000003";

  beforeEach(() => {
    tables.tenants = [
      { id: TENANT_A, name: "Empresa A" },
      { id: TENANT_B, name: "Empresa B" },
      { id: TENANT_C, name: "Empresa Vazia" },
    ];
  });

  it("recusa excluir empresa com usuários ou quadros e explica o motivo", async () => {
    await expect(callerFor(5).branding.deleteTenant({ id: "bbbbbbbb-0000-4000-8000-000000000002" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    tables.tenants.push({ id: "dddddddd-0000-4000-8000-000000000004", name: "Empresa D" });
    tables.users.push({ id: 77, username: "d1", role: "user", tenant_id: "dddddddd-0000-4000-8000-000000000004" });
    await expect(
      callerFor(5).branding.deleteTenant({ id: "dddddddd-0000-4000-8000-000000000004" })
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("1 usuário(s)") });
    expect(tables.tenants.some((t) => t.name === "Empresa D")).toBe(true);
    expect(tables.users.some((u) => u.id === 77)).toBe(true);
  });

  it("exclui empresa vazia e só o super administrador pode", async () => {
    await expect(callerFor(2).branding.deleteTenant({ id: TENANT_C })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(2).branding.tenantUsage()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await callerFor(5).branding.deleteTenant({ id: TENANT_C });
    expect(tables.tenants.some((t) => t.id === TENANT_C)).toBe(false);
  });

  it("tenantUsage conta usuários e quadros por empresa", async () => {
    const usage = await callerFor(5).branding.tenantUsage();
    expect(usage[TENANT_B]).toEqual({ users: 2, boards: 1 });
    expect(usage[TENANT_C]).toBeUndefined();
  });
});

describe("admin.users — desativação", () => {
  const SENHA = "frase longa de teste";

  beforeEach(() => {
    tables.tenants = [{ id: TENANT_A, name: "Empresa A" }, { id: TENANT_B, name: "Empresa B" }];
  });

  it("usuário com histórico é desativado em vez de excluído, e pode ser reativado", async () => {
    const { id } = await callerFor(2).admin.users.create({ username: "hist@a.com", password: SENHA });
    authAdmin.blockUserDelete = true;

    const result = await callerFor(2).admin.users.delete({ id });
    expect(result.mode).toBe("deactivated");
    const row = tables.users.find((u) => u.id === id);
    expect(row.disabled_at).toBeTruthy();
    expect(tables.user_tenants.some((t) => t.user_id === id)).toBe(true);
    expect((authAdmin.accounts[0] as any).ban_duration).toBe("876000h");

    const list = await callerFor(2).admin.users.list();
    expect(list.find((u) => u.id === id)?.disabledAt).toBeTruthy();

    await callerFor(2).admin.users.update({ id, active: true });
    expect(tables.users.find((u) => u.id === id).disabled_at).toBeNull();
    expect((authAdmin.accounts[0] as any).ban_duration).toBe("none");
  });

  it("usuário sem histórico continua sendo excluído", async () => {
    const { id } = await callerFor(2).admin.users.create({ username: "novo2@a.com", password: SENHA });
    const result = await callerFor(2).admin.users.delete({ id });
    expect(result.mode).toBe("deleted");
    expect(tables.users.some((u) => u.id === id)).toBe(false);
  });

  it("ninguém desativa a si mesmo nem usuário de outra empresa", async () => {
    await callerFor(2).admin.users.update({ id: 2, active: false });
    expect(tables.users.find((u) => u.id === 2).disabled_at ?? null).toBeNull();
    await expect(callerFor(2).admin.users.update({ id: 3, active: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(1).admin.users.update({ id: 2, active: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("conta desativada não faz login", async () => {
    tables.users.find((u) => u.id === 1).disabled_at = new Date().toISOString();
    await expect(callerFor(1).auth.login({ username: "alice", password: "segredo" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("pacote de adoção", () => {
  const SENHA = "frase longa de teste";
  const SMTP = { SMTP_HOST: "smtp.test", SMTP_USER: "app@test.com", SMTP_PASS: "x", EMAIL_FROM: "app@test.com" };
  const withSmtp = () => Object.assign(process.env, SMTP);

  beforeEach(() => {
    tables.tenants = [{ id: TENANT_A, name: "Empresa A" }, { id: TENANT_B, name: "Empresa B" }];
    tables.users.push({ id: 11, username: "carla@a.com", name: "Carla", role: "user", tenant_id: TENANT_A });
  });
  afterEach(() => {
    for (const key of Object.keys(SMTP)) delete process.env[key];
  });

  it("convite sem e-mail configurado devolve o link para envio manual", async () => {
    const result = await callerFor(2).admin.users.invite({ email: "Nova@A.com", name: "Nova", role: "user" });
    expect(result.emailSent).toBe(false);
    expect(result.link).toContain("https://auth.test/verify");
    const row = tables.users.find((u) => u.id === result.id);
    expect(row).toMatchObject({ username: "nova@a.com", tenant_id: TENANT_A, role: "user" });
    expect(row.auth_id).toBe(authAdmin.accounts[0].id);
    expect(mail.sent).toHaveLength(0);
    expect(tables.audit_logs.some((l) => l.entity_id === result.id && /convidado/.test(l.details))).toBe(true);
  });

  it("convite com e-mail configurado envia e não expõe o link", async () => {
    withSmtp();
    const result = await callerFor(5).admin.users.invite({ email: "b2@b.com", role: "admin", tenantId: TENANT_B });
    expect(result).toMatchObject({ emailSent: true, link: null });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "b2@b.com", subject: "Convite para o DStasks" });
    expect(mail.sent[0].html).toContain("Empresa B");
  });

  it("convite respeita a segregação por empresa", async () => {
    await expect(callerFor(2).admin.users.invite({ email: "x@b.com", tenantId: TENANT_B })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(1).admin.users.invite({ email: "y@a.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(2).admin.users.invite({ email: "carla@a.com" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(authAdmin.accounts).toHaveLength(0);
  });

  it("quem recebeu o convite define a senha e já entra", async () => {
    const { id, link } = await callerFor(2).admin.users.invite({ email: "entra@a.com" });
    const token = new URL(link!).searchParams.get("token")!;
    const cookies: string[] = [];
    const caller = appRouter.createCaller({
      user: null,
      tenantId: null,
      req: { protocol: "https", headers: {} },
      res: { cookie: (name: string) => cookies.push(name), clearCookie: () => {} },
    } as any);

    await expect(caller.auth.completeAccess({ accessToken: token, password: "curta" })).rejects.toBeTruthy();
    await expect(caller.auth.completeAccess({ accessToken: "token-que-nao-existe-123456", password: SENHA })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await caller.auth.completeAccess({ accessToken: token, password: SENHA });
    expect(authAdmin.accounts[0].password).toBe(SENHA);
    expect(tables.users.find((u) => u.id === id).password).not.toBe("");
    expect(cookies).toHaveLength(1);

    tables.users.find((u) => u.id === id).disabled_at = new Date().toISOString();
    await expect(caller.auth.completeAccess({ accessToken: token, password: SENHA })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("esqueci minha senha: resposta igual para quem existe ou não", async () => {
    const anon = appRouter.createCaller({ user: null, tenantId: null, req: { headers: {} }, res: { cookie: () => {} } } as any);
    expect(await anon.auth.requestPasswordReset({ email: "carla@a.com" })).toEqual({ ok: true, emailEnabled: false });
    expect(mail.sent).toHaveLength(0);

    withSmtp();
    authAdmin.accounts.push({ id: "auth-carla", email: "carla@a.com", password: "antiga", user_metadata: {} });
    tables.users.find((u) => u.id === 11).auth_id = "auth-carla";
    expect(await anon.auth.requestPasswordReset({ email: "CARLA@a.com" })).toEqual({ ok: true, emailEnabled: true });
    expect(await anon.auth.requestPasswordReset({ email: "ninguem@a.com" })).toEqual({ ok: true, emailEnabled: true });
    expect(mail.sent.map((m) => m.to)).toEqual(["carla@a.com"]);
  });

  it("menção avisa só quem é da empresa do quadro e respeita a preferência de e-mail", async () => {
    withSmtp();
    await callerFor(1).cardDetails.addComment({ cardId: 1000, content: "@Carla e @bob vejam", mentions: [11, 3, 1] });
    const notes = tables.notifications || [];
    expect(notes.map((n) => n.user_id)).toEqual([11]);
    expect(notes[0]).toMatchObject({ type: "comment_mention", related_card_id: 1000, related_board_id: 10, tenant_id: TENANT_A });
    expect(mail.sent.map((m) => m.to)).toEqual(["carla@a.com"]);

    tables.user_preferences = [{ user_id: 11, email_on_card_updated: false }];
    await callerFor(1).cardDetails.addComment({ cardId: 1000, content: "@Carla de novo", mentions: [11] });
    expect(tables.notifications).toHaveLength(2);
    expect(mail.sent).toHaveLength(1);
  });

  it("atribuir um cartão avisa o novo responsável, nunca quem atribuiu a si mesmo", async () => {
    await callerFor(1).cardDetails.updateAssignedTo({ cardId: 1000, userId: 11 });
    expect((tables.notifications || []).map((n) => [n.user_id, n.type])).toEqual([[11, "card_assigned"]]);
    await callerFor(1).cardDetails.updateAssignedTo({ cardId: 1000, userId: 1 });
    expect(tables.notifications).toHaveLength(1);
  });

  it("link de acesso: administrador da empresa, conta ativa e com e-mail", async () => {
    const result = await callerFor(2).admin.users.sendAccessLink({ id: 11 });
    expect(result.emailSent).toBe(false);
    expect(result.link).toContain("token-invite");
    expect(tables.users.find((u) => u.id === 11).auth_id).toBe(authAdmin.accounts[0].id);

    await expect(callerFor(2).admin.users.sendAccessLink({ id: 3 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(callerFor(2).admin.users.sendAccessLink({ id: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    tables.users.find((u) => u.id === 11).disabled_at = new Date().toISOString();
    await expect(callerFor(2).admin.users.sendAccessLink({ id: 11 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
