/**
 * Automações por quadro: QUANDO (gatilho) → SE (condições) → ENTÃO (ações).
 * Este arquivo descreve o que existe e decide se uma regra se aplica a um
 * cartão; a execução das ações fica no servidor (server/automations.ts).
 */

export const TRIGGER_TYPES = ["card_created", "card_moved", "card_completed", "field_changed", "due_soon", "overdue", "stale"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

/** Gatilhos verificados periodicamente (não nascem de uma ação do usuário). */
export const SCHEDULED_TRIGGERS: TriggerType[] = ["due_soon", "overdue", "stale"];

export const CONDITION_OPS = ["eq", "neq", "empty", "notEmpty"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export const ACTION_TYPES = ["notify", "set_field", "move_to_list", "assign", "add_checklist", "add_comment"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const NOTIFY_TARGETS = ["assignee", "owner", "admins"] as const;
export type NotifyTarget = (typeof NOTIFY_TARGETS)[number];

/** Campos internos do cartão usáveis em condições (além dos campos do tema). */
export const BUILTIN_FIELDS = { list: "@lista", assignee: "@responsavel" } as const;

export interface AutomationTrigger {
  type: TriggerType;
  /** card_moved: lista de destino (vazio = qualquer). */
  list?: string;
  /** field_changed: campo observado. */
  field?: string;
  /** due_soon: dias até o prazo; stale: dias sem atualização. */
  days?: number;
}

export interface AutomationCondition {
  field: string;
  op: ConditionOp;
  value?: string;
}

export type AutomationAction =
  | { type: "notify"; target: NotifyTarget; message?: string }
  | { type: "set_field"; field: string; value: string }
  | { type: "move_to_list"; list: string }
  | { type: "assign"; userId: number }
  | { type: "add_checklist"; title: string; items: string[] }
  | { type: "add_comment"; text: string };

export interface AutomationRule {
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  card_created: "Um cartão for criado",
  card_moved: "Um cartão for movido para uma lista",
  card_completed: "Um cartão for concluído",
  field_changed: "Um campo do cartão for alterado",
  due_soon: "O prazo estiver próximo",
  overdue: "O cartão estiver atrasado",
  stale: "O cartão ficar sem atualização",
};

export const OP_LABELS: Record<ConditionOp, string> = {
  eq: "é",
  neq: "não é",
  empty: "está vazio",
  notEmpty: "está preenchido",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  notify: "Notificar",
  set_field: "Definir campo",
  move_to_list: "Mover para a lista",
  assign: "Atribuir responsável",
  add_checklist: "Criar checklist (subtarefas)",
  add_comment: "Registrar comentário",
};

export const TARGET_LABELS: Record<NotifyTarget, string> = {
  assignee: "o responsável pelo cartão",
  owner: "o dono do quadro",
  admins: "os administradores da empresa",
};

/** Retrato do cartão usado para avaliar gatilho e condições. */
export interface CardSnapshot {
  id: number;
  title: string;
  listName: string;
  assigneeName: string | null;
  status: string | null;
  dueDate: string | Date | null;
  updatedAt: string | Date | null;
  fields: Record<string, string>;
}

export interface AutomationEvent {
  type: TriggerType;
  /** card_moved: lista de destino. */
  toList?: string;
  /** field_changed: campo alterado. */
  field?: string;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const DAY = 86400000;

export function fieldValue(card: CardSnapshot, field: string): string {
  if (field === BUILTIN_FIELDS.list) return card.listName;
  if (field === BUILTIN_FIELDS.assignee) return card.assigneeName ?? "";
  return card.fields[field] ?? "";
}

export function matchesConditions(card: CardSnapshot, conditions: AutomationCondition[]): boolean {
  return conditions.every((condition) => {
    const actual = norm(fieldValue(card, condition.field));
    const expected = norm(condition.value);
    if (condition.op === "empty") return actual === "";
    if (condition.op === "notEmpty") return actual !== "";
    if (condition.op === "eq") return actual === expected;
    return actual !== expected;
  });
}

/** O evento (ação do usuário) dispara este gatilho? */
export function matchesEvent(trigger: AutomationTrigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (trigger.type === "card_moved") return !trigger.list || norm(trigger.list) === norm(event.toList);
  if (trigger.type === "field_changed") return !trigger.field || trigger.field === event.field;
  return true;
}

/** Gatilhos de tempo: o cartão está, agora, na situação descrita? */
export function matchesSchedule(trigger: AutomationTrigger, card: CardSnapshot, now: Date = new Date()): boolean {
  if (card.status === "completed") return false;
  const t = now.getTime();
  const due = card.dueDate ? new Date(card.dueDate).getTime() : NaN;
  if (trigger.type === "overdue") return !Number.isNaN(due) && due < t;
  if (trigger.type === "due_soon") {
    const days = Math.max(0, trigger.days ?? 1);
    return !Number.isNaN(due) && due >= t && due - t <= days * DAY;
  }
  if (trigger.type === "stale") {
    const updated = card.updatedAt ? new Date(card.updatedAt).getTime() : NaN;
    const days = Math.max(1, trigger.days ?? 3);
    return !Number.isNaN(updated) && t - updated >= days * DAY;
  }
  return false;
}

/** Frase legível da regra, para a lista de automações. */
export function describeRule(rule: Pick<AutomationRule, "trigger" | "conditions" | "actions">, userName?: (id: number) => string): string {
  const t = rule.trigger;
  let when = TRIGGER_LABELS[t.type];
  if (t.type === "card_moved" && t.list) when = `Um cartão for movido para "${t.list}"`;
  if (t.type === "field_changed" && t.field) when = `O campo "${t.field}" for alterado`;
  if (t.type === "due_soon") when = `Faltar ${t.days ?? 1} dia(s) ou menos para o prazo`;
  if (t.type === "stale") when = `O cartão ficar ${t.days ?? 3} dia(s) sem atualização`;

  const fieldLabel = (f: string) => (f === BUILTIN_FIELDS.list ? "Lista" : f === BUILTIN_FIELDS.assignee ? "Responsável" : f);
  const ifs = rule.conditions.map((c) => `${fieldLabel(c.field)} ${OP_LABELS[c.op]}${c.op === "eq" || c.op === "neq" ? ` "${c.value ?? ""}"` : ""}`);

  const thens = rule.actions.map((a) => {
    if (a.type === "notify") return `notificar ${TARGET_LABELS[a.target]}`;
    if (a.type === "set_field") return `definir ${a.field} como "${a.value}"`;
    if (a.type === "move_to_list") return `mover para "${a.list}"`;
    if (a.type === "assign") return `atribuir a ${userName ? userName(a.userId) : `usuário ${a.userId}`}`;
    if (a.type === "add_checklist") return `criar o checklist "${a.title}"`;
    return "registrar um comentário";
  });

  return `Quando ${when.charAt(0).toLowerCase()}${when.slice(1)}${ifs.length ? `, se ${ifs.join(" e ")}` : ""}, ${thens.join("; ")}.`;
}

/** Modelos prontos por segmento (o usuário ajusta antes de salvar). */
export function ruleTemplates(themeKey: string): AutomationRule[] {
  const common: AutomationRule[] = [
    {
      name: "Avisar sobre prazo próximo",
      trigger: { type: "due_soon", days: 2 },
      conditions: [],
      actions: [{ type: "notify", target: "assignee", message: "O prazo deste cartão está próximo." }],
    },
    {
      name: "Avisar o dono sobre atrasos",
      trigger: { type: "overdue" },
      conditions: [],
      actions: [{ type: "notify", target: "owner", message: "Cartão com prazo vencido." }],
    },
  ];
  if (themeKey === "siem") {
    return [
      {
        name: "Incidente crítico: avisar administradores",
        trigger: { type: "field_changed", field: "Severidade" },
        conditions: [{ field: "Severidade", op: "eq", value: "Crítica" }],
        actions: [{ type: "notify", target: "admins", message: "Incidente classificado como crítico." }],
      },
      {
        name: "Crítico sem responsável",
        trigger: { type: "stale", days: 1 },
        conditions: [
          { field: "Severidade", op: "eq", value: "Crítica" },
          { field: BUILTIN_FIELDS.assignee, op: "empty" },
        ],
        actions: [{ type: "notify", target: "owner", message: "Incidente crítico sem responsável há mais de 1 dia." }],
      },
      {
        name: "Procedimento de resposta na contenção",
        trigger: { type: "card_moved", list: "Contenção" },
        conditions: [],
        actions: [{ type: "add_checklist", title: "Resposta ao incidente", items: ["Isolar o ativo afetado", "Preservar evidências", "Comunicar os responsáveis", "Registrar ações executadas"] }],
      },
      ...common,
    ];
  }
  if (themeKey === "crm") {
    return [
      {
        name: "Negociação parada",
        trigger: { type: "stale", days: 7 },
        conditions: [{ field: BUILTIN_FIELDS.list, op: "eq", value: "Em negociação" }],
        actions: [{ type: "notify", target: "assignee", message: "Negociação sem movimentação há 7 dias." }],
      },
      {
        name: "Follow-up após proposta",
        trigger: { type: "card_moved", list: "Proposta enviada" },
        conditions: [],
        actions: [{ type: "add_checklist", title: "Follow-up", items: ["Confirmar recebimento da proposta", "Agendar retorno"] }],
      },
      ...common,
    ];
  }
  if (themeKey === "dev") {
    return [
      {
        name: "Revisão de código pendente",
        trigger: { type: "card_moved", list: "Code Review" },
        conditions: [],
        actions: [{ type: "notify", target: "owner", message: "Há uma tarefa aguardando revisão de código." }],
      },
      {
        name: "Hotfix: avisar administradores",
        trigger: { type: "field_changed", field: "Tipo de atividade" },
        conditions: [{ field: "Tipo de atividade", op: "eq", value: "Hotfix" }],
        actions: [{ type: "notify", target: "admins", message: "Hotfix registrado." }],
      },
      ...common,
    ];
  }
  if (themeKey === "ecommerce") {
    return [
      {
        name: "Aguardando aprovação",
        trigger: { type: "card_moved", list: "Aguardando aprovação" },
        conditions: [],
        actions: [{ type: "notify", target: "owner", message: "Uma atividade depende da sua aprovação." }],
      },
      ...common,
    ];
  }
  return common;
}
