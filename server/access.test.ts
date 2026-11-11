import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de autorização (isolamento por tenant).
 * O Supabase é substituído por tabelas em memória: nada toca o banco real.
 */
const { tables, fakeSupabase } = vi.hoisted(() => {
  const tables: Record<string, any[]> = {};

  class Query {
    private filters: Array<(row: any) => boolean> = [];
    private op: "select" | "delete" | "update" = "select";
    private patch: any = null;
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
      (tables[this.table] ||= []).push(...(Array.isArray(row) ? row : [row]));
      return this;
    }
    upsert(row: any) { return this.insert(row); }

    private run() {
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

  const fakeSupabase = {
    from: (table: string) => new Query(table),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  };
  return { tables, fakeSupabase };
});

vi.mock("./_core/supabase.js", () => ({ supabase: fakeSupabase }));

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
