import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema.js";
import { supabase } from "./supabase.js";
import { protectedProcedure } from "./trpc.js";

/**
 * Controle de acesso centralizado.
 *
 * O servidor fala com o Supabase usando a service role key, que ignora o RLS.
 * Por isso TODA rota que recebe um ID vindo do cliente precisa confirmar que o
 * recurso pertence ao tenant do usuário. A regra aplicada aqui é o isolamento
 * por tenant (master_admin tem acesso global): o recurso é resolvido até o
 * quadro (board) e o tenant do quadro é comparado com o do usuário.
 */

/** Tabelas filhas de um cartão (todas possuem a coluna card_id). */
const CARD_CHILD_TABLES = [
  "card_labels",
  "card_attachments",
  "card_checklist_groups",
  "card_checklists",
  "card_custom_fields",
  "card_comments",
] as const;

type CardChildTable = (typeof CARD_CHILD_TABLES)[number];
export type ResourceKind = "board" | "list" | "card" | "user" | CardChildTable;

type AccessUser = Pick<User, "id" | "role" | "tenantId">;

function deny(): never {
  // Mesma resposta para "não existe" e "não é seu": não revela a existência do recurso.
  throw new TRPCError({ code: "NOT_FOUND", message: "Recurso não encontrado ou acesso negado" });
}

async function fetchRow(table: string, columns: string, id: number): Promise<any> {
  const { data, error } = await supabase.from(table).select(columns).eq("id", id).maybeSingle();
  if (error) {
    console.error(`[Access] Falha ao consultar ${table}#${id}:`, error.message);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao verificar permissão" });
  }
  return data;
}

async function resolveBoardId(kind: Exclude<ResourceKind, "user">, id: number): Promise<number> {
  if (kind === "board") return id;

  if (kind === "list") {
    const list = await fetchRow("lists", "id, board_id", id);
    if (!list?.board_id) deny();
    return list.board_id;
  }

  if (kind === "card") {
    const card = await fetchRow("cards", "id, list_id", id);
    if (!card?.list_id) deny();
    return resolveBoardId("list", card.list_id);
  }

  const child = await fetchRow(kind, "id, card_id", id);
  if (!child?.card_id) deny();
  return resolveBoardId("card", child.card_id);
}

/**
 * Garante que o usuário pode acessar o recurso. Lança NOT_FOUND caso contrário.
 */
export async function assertAccess(user: AccessUser, kind: ResourceKind, id: number): Promise<void> {
  if (typeof id !== "number" || !Number.isFinite(id)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Identificador inválido" });
  }

  if (kind === "user") {
    if (id === user.id) return;
    const target = await fetchRow("users", "id, tenant_id", id);
    if (!target) deny();
    if (user.role === "master_admin") return;
    if (!user.tenantId || target.tenant_id !== user.tenantId) deny();
    return;
  }

  const boardId = await resolveBoardId(kind, id);
  const board = await fetchRow("boards", "id, tenant_id", boardId);
  if (!board) deny();
  if (user.role === "master_admin") return;
  // Usuário sem tenant não acessa nenhum quadro; quadro sem tenant não é de ninguém.
  if (!user.tenantId || !board.tenant_id || board.tenant_id !== user.tenantId) deny();
}

/**
 * Procedure autenticada que valida, ANTES do handler, os IDs recebidos no input.
 *
 *   guardedProcedure({ cardId: "card", targetListId: "list" })
 *
 * Cada chave é o nome do campo no input e o valor é o tipo de recurso. Campos
 * ausentes/nulos são ignorados (a obrigatoriedade continua a cargo do zod).
 */
export function guardedProcedure(guards: Record<string, ResourceKind>) {
  return protectedProcedure.use(async (opts) => {
    const raw = (await (opts as any).getRawInput()) as Record<string, unknown> | undefined;
    if (raw && typeof raw === "object") {
      for (const [key, kind] of Object.entries(guards)) {
        const value = raw[key];
        if (value === undefined || value === null) continue;
        await assertAccess(opts.ctx.user, kind, value as number);
      }
    }
    return opts.next();
  });
}

/** Papéis que administram o próprio tenant. */
/**
 * Empresa (tenant) dona de um recurso. Linhas novas (listas, cartões,
 * comentários, anexos) devem herdar a empresa do quadro em que estão — e não
 * a de quem está logado: o master_admin atua em quadros de várias empresas.
 */
export async function tenantOf(kind: Exclude<ResourceKind, "user">, id: number): Promise<string> {
  const boardId = await resolveBoardId(kind, id);
  const board = await fetchRow("boards", "id, tenant_id", boardId);
  if (!board?.tenant_id) deny();
  return board.tenant_id;
}

export function isTenantAdmin(user: Pick<User, "role">): boolean {
  return user.role === "admin" || user.role === "master_admin";
}
