/**
 * Motor de automações (Fase 4).
 *
 * - runAutomations: chamado depois de uma ação do usuário (criar, mover,
 *   concluir, alterar campo). Nunca derruba a ação original: qualquer falha
 *   vira um registro de erro no histórico da regra.
 * - runScheduledAutomations: gatilhos de tempo (prazo próximo, atraso, sem
 *   atualização). Roda quando alguém abre o quadro, no máximo a cada 30 min
 *   por regra, e no máximo uma vez por dia para cada cartão.
 *
 * As ações só mexem no cartão que disparou a regra e dentro do próprio
 * quadro; escritas feitas aqui não disparam outras regras (sem cascata).
 */
import { supabase } from "./_core/supabase.js";
import { getBoardTheme, validateFieldValue } from "../shared/boardThemes.js";
import {
  SCHEDULED_TRIGGERS,
  matchesConditions,
  matchesEvent,
  matchesSchedule,
  type AutomationAction,
  type AutomationCondition,
  type AutomationEvent,
  type AutomationTrigger,
  type CardSnapshot,
} from "../shared/automationRules.js";

interface AutomationRow {
  id: number;
  board_id: number;
  tenant_id: string;
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
  created_by: number | null;
  run_count: number;
  last_checked_at: string | null;
}

interface BoardContext {
  board: any;
  lists: { id: number; name: string }[];
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

async function loadBoardContext(boardId: number): Promise<BoardContext | null> {
  const { data: board } = await supabase.from("boards").select("*").eq("id", boardId).maybeSingle();
  if (!board) return null;
  const { data: lists } = await supabase.from("lists").select("*").eq("board_id", boardId);
  return { board, lists: ((lists || []) as any[]).map((l) => ({ id: l.id, name: l.name })) };
}

async function snapshotCards(ctx: BoardContext, cardRows: any[]): Promise<Map<number, { row: any; snap: CardSnapshot }>> {
  const out = new Map<number, { row: any; snap: CardSnapshot }>();
  if (cardRows.length === 0) return out;
  const ids = cardRows.map((c) => c.id);
  const userIds = Array.from(new Set(cardRows.map((c) => c.assigned_to).filter((id) => id != null)));
  const [fieldsRes, usersRes] = await Promise.all([
    supabase.from("card_custom_fields").select("card_id, field_name, field_value").in("card_id", ids),
    userIds.length ? supabase.from("users").select("id, name, username").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const names = new Map<number, string>(((usersRes.data || []) as any[]).map((u) => [u.id, u.name || u.username]));
  const listName = new Map(ctx.lists.map((l) => [l.id, l.name]));
  for (const row of cardRows) {
    const fields: Record<string, string> = {};
    for (const f of (fieldsRes.data || []) as any[]) {
      if (f.card_id === row.id && f.field_value) fields[f.field_name] = f.field_value;
    }
    out.set(row.id, {
      row,
      snap: {
        id: row.id,
        title: row.title,
        listName: listName.get(row.list_id) || "",
        assigneeName: row.assigned_to != null ? names.get(row.assigned_to) || null : null,
        status: row.status ?? null,
        dueDate: row.due_date ?? null,
        updatedAt: row.updated_at ?? null,
        fields,
      },
    });
  }
  return out;
}

/** Executa as ações de uma regra em um cartão. Devolve o resumo do que fez. */
async function executeActions(rule: AutomationRow, ctx: BoardContext, row: any, snap: CardSnapshot): Promise<string> {
  const done: string[] = [];
  const tenantId = ctx.board.tenant_id;

  for (const action of rule.actions) {
    if (action.type === "notify") {
      let recipients: number[] = [];
      if (action.target === "assignee" && row.assigned_to != null) recipients = [row.assigned_to];
      if (action.target === "owner" && ctx.board.owner_id != null) recipients = [ctx.board.owner_id];
      if (action.target === "admins") {
        const { data } = await supabase.from("users").select("id, role").eq("tenant_id", tenantId).eq("role", "admin");
        recipients = ((data || []) as any[]).map((u) => u.id);
      }
      recipients = Array.from(new Set(recipients));
      if (recipients.length === 0) {
        done.push("notificação sem destinatário");
        continue;
      }
      const { error } = await supabase.from("notifications").insert(
        recipients.map((userId) => ({
          user_id: userId,
          tenant_id: tenantId,
          type: "card_updated",
          related_card_id: row.id,
          related_board_id: ctx.board.id,
          title: rule.name.slice(0, 255),
          message: `${snap.title}${action.message ? ` — ${action.message}` : ""}`,
        }))
      );
      if (error) throw new Error(`notificar: ${error.message}`);
      done.push(`${recipients.length} notificação(ões)`);
    }

    if (action.type === "set_field") {
      const theme = getBoardTheme(ctx.board.theme);
      const themeField = theme.fields.find((f) => f.key === action.field);
      if (themeField) {
        const problem = validateFieldValue(theme, themeField, action.value, ctx.board.settings);
        if (problem) throw new Error(problem);
      }
      const { error } = await supabase
        .from("card_custom_fields")
        .upsert({ card_id: row.id, field_name: action.field, field_value: action.value, field_type: "text" }, { onConflict: "card_id,field_name" });
      if (error) throw new Error(`definir campo: ${error.message}`);
      done.push(`${action.field} = ${action.value}`);
    }

    if (action.type === "move_to_list") {
      const target = ctx.lists.find((l) => l.name.trim().toLowerCase() === action.list.trim().toLowerCase());
      if (!target) throw new Error(`lista "${action.list}" não existe neste quadro`);
      if (target.id !== row.list_id) {
        const { error } = await supabase.from("cards").update({ list_id: target.id, updated_at: new Date().toISOString() }).eq("id", row.id);
        if (error) throw new Error(`mover: ${error.message}`);
        row.list_id = target.id;
      }
      done.push(`movido para ${target.name}`);
    }

    if (action.type === "assign") {
      const { data: user } = await supabase.from("users").select("*").eq("id", action.userId).maybeSingle();
      if (!user || (user as any).tenant_id !== tenantId) throw new Error("responsável não pertence a esta empresa");
      const { error } = await supabase.from("cards").update({ assigned_to: action.userId, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw new Error(`atribuir: ${error.message}`);
      row.assigned_to = action.userId;
      done.push(`atribuído a ${(user as any).name || (user as any).username}`);
    }

    if (action.type === "add_checklist") {
      const { data: existing } = await supabase.from("card_checklist_groups").select("*").eq("card_id", row.id);
      // Mesma regra no mesmo cartão não duplica o checklist.
      if (((existing || []) as any[]).some((g) => String(g.title).trim().toLowerCase() === action.title.trim().toLowerCase())) {
        done.push(`checklist "${action.title}" já existia`);
        continue;
      }
      const { data: group, error } = await supabase
        .from("card_checklist_groups")
        .insert({ card_id: row.id, title: action.title.slice(0, 255), position: (existing || []).length })
        .select("id")
        .single();
      if (error || !group) throw new Error(`checklist: ${error?.message || "falha ao criar"}`);
      if (action.items.length > 0) {
        const { error: itemsError } = await supabase.from("card_checklists").insert(
          action.items.map((title, position) => ({ card_id: row.id, group_id: (group as any).id, title: title.slice(0, 255), position }))
        );
        if (itemsError) throw new Error(`itens do checklist: ${itemsError.message}`);
      }
      done.push(`checklist "${action.title}"`);
    }

    if (action.type === "add_comment") {
      const author = rule.created_by ?? ctx.board.owner_id;
      const { error } = await supabase
        .from("card_comments")
        .insert({ card_id: row.id, tenant_id: tenantId, user_id: author, content: `[Automação: ${rule.name}] ${action.text}` });
      if (error) throw new Error(`comentário: ${error.message}`);
      done.push("comentário registrado");
    }
  }
  return done.join("; ");
}

async function runRuleOnCard(rule: AutomationRow, ctx: BoardContext, row: any, snap: CardSnapshot) {
  let status = "ok";
  let detail = "";
  try {
    detail = await executeActions(rule, ctx, row, snap);
  } catch (error: any) {
    status = "error";
    detail = error?.message || "erro desconhecido";
  }
  await supabase.from("automation_runs").insert({
    automation_id: rule.id,
    board_id: rule.board_id,
    tenant_id: rule.tenant_id,
    card_id: row.id,
    card_title: snap.title,
    status,
    detail,
  });
  rule.run_count = (rule.run_count || 0) + 1;
  await supabase.from("automations").update({ run_count: rule.run_count, last_run_at: new Date().toISOString() }).eq("id", rule.id);
  return status;
}

async function enabledRules(boardId: number): Promise<AutomationRow[]> {
  const { data, error } = await supabase.from("automations").select("*").eq("board_id", boardId).eq("enabled", true);
  if (error) return []; // tabela ainda não criada (migração 0011) ou indisponível
  return (data || []) as AutomationRow[];
}

/** Dispara as regras do quadro para um evento em um cartão. Nunca lança erro. */
export async function runAutomations(event: AutomationEvent & { cardId: number }): Promise<number> {
  try {
    const { data: row } = await supabase.from("cards").select("*").eq("id", event.cardId).maybeSingle();
    if (!row) return 0;
    const { data: list } = await supabase.from("lists").select("*").eq("id", (row as any).list_id).maybeSingle();
    if (!list) return 0;
    const boardId = (list as any).board_id;

    const rules = (await enabledRules(boardId)).filter((rule) => matchesEvent(rule.trigger, event));
    if (rules.length === 0) return 0;

    const ctx = await loadBoardContext(boardId);
    if (!ctx) return 0;

    let ran = 0;
    for (const rule of rules) {
      // Retrato atualizado a cada regra: uma ação anterior pode ter mudado o cartão.
      const { data: fresh } = await supabase.from("cards").select("*").eq("id", event.cardId).maybeSingle();
      if (!fresh) break;
      const item = (await snapshotCards(ctx, [fresh])).get(event.cardId);
      if (!item || !matchesConditions(item.snap, rule.conditions)) continue;
      await runRuleOnCard(rule, ctx, item.row, item.snap);
      ran++;
    }
    return ran;
  } catch (error) {
    console.error("[Automations] runAutomations failed:", error);
    return 0;
  }
}

/** Verifica os gatilhos de tempo de um quadro. Nunca lança erro. */
export async function runScheduledAutomations(boardId: number, now: Date = new Date()): Promise<number> {
  try {
    const rules = (await enabledRules(boardId)).filter(
      (rule) =>
        SCHEDULED_TRIGGERS.includes(rule.trigger.type) &&
        (!rule.last_checked_at || now.getTime() - new Date(rule.last_checked_at).getTime() >= CHECK_INTERVAL_MS)
    );
    if (rules.length === 0) return 0;

    const ctx = await loadBoardContext(boardId);
    if (!ctx || ctx.lists.length === 0) return 0;
    const { data: cardRows } = await supabase.from("cards").select("*").in("list_id", ctx.lists.map((l) => l.id)).eq("archived", false);
    const cards = await snapshotCards(ctx, (cardRows || []) as any[]);

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    let ran = 0;
    for (const rule of rules) {
      await supabase.from("automations").update({ last_checked_at: now.toISOString() }).eq("id", rule.id);
      const { data: todays } = await supabase.from("automation_runs").select("card_id, created_at").eq("automation_id", rule.id);
      const already = new Set(
        ((todays || []) as any[]).filter((r) => new Date(r.created_at).getTime() >= dayStart.getTime()).map((r) => r.card_id)
      );
      for (const { row, snap } of cards.values()) {
        if (already.has(row.id)) continue;
        if (!matchesSchedule(rule.trigger, snap, now) || !matchesConditions(snap, rule.conditions)) continue;
        await runRuleOnCard(rule, ctx, row, snap);
        ran++;
      }
    }
    return ran;
  } catch (error) {
    console.error("[Automations] runScheduledAutomations failed:", error);
    return 0;
  }
}
