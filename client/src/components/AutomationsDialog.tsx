import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowLeft, CheckCircle2, History, Loader2, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { getBoardTheme } from "@shared/boardThemes";
import {
  ACTION_LABELS,
  ACTION_TYPES,
  BUILTIN_FIELDS,
  CONDITION_OPS,
  NOTIFY_TARGETS,
  OP_LABELS,
  TARGET_LABELS,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  describeRule,
  ruleTemplates,
  type ActionType,
  type AutomationAction,
  type AutomationRule,
} from "@shared/automationRules";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  boardId: number;
  themeKey: string;
  lists: string[];
  canManage: boolean;
}

const EMPTY_RULE: AutomationRule = {
  name: "",
  trigger: { type: "card_created" },
  conditions: [],
  actions: [{ type: "notify", target: "assignee", message: "" }],
};

const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25";

function newAction(type: ActionType): AutomationAction {
  if (type === "notify") return { type, target: "assignee", message: "" };
  if (type === "set_field") return { type, field: "", value: "" };
  if (type === "move_to_list") return { type, list: "" };
  if (type === "assign") return { type, userId: 0 };
  if (type === "add_checklist") return { type, title: "", items: [] };
  return { type: "add_comment", text: "" };
}

/** Configurações do quadro → Automações (QUANDO → SE → ENTÃO). */
export default function AutomationsDialog({ isOpen, onClose, boardId, themeKey, lists, canManage }: Props) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.automations.list.useQuery({ boardId }, { enabled: isOpen } as any);
  const { data: history } = trpc.automations.history.useQuery({ boardId }, { enabled: isOpen } as any);
  const { data: members } = trpc.boards.getMembers.useQuery({ boardId }, { enabled: isOpen && canManage, retry: false } as any);
  const createMutation = trpc.automations.create.useMutation();
  const updateMutation = trpc.automations.update.useMutation();
  const deleteMutation = trpc.automations.delete.useMutation();

  const [tab, setTab] = useState<"rules" | "history">("rules");
  const [editing, setEditing] = useState<{ id: number | null; rule: AutomationRule } | null>(null);

  const theme = getBoardTheme(themeKey);
  const people = ((members as any[]) || []).map((m) => ({ id: m.userId as number, name: m.userName as string }));
  const userName = (id: number) => people.find((p) => p.id === id)?.name || `usuário ${id}`;
  const fieldOptions = [
    { value: BUILTIN_FIELDS.list, label: "Lista" },
    { value: BUILTIN_FIELDS.assignee, label: "Responsável" },
    ...theme.fields.map((f) => ({ value: f.key, label: f.label })),
  ];

  const refresh = () => Promise.all([utils.automations.list.invalidate({ boardId }), utils.automations.history.invalidate({ boardId })]);

  const save = async () => {
    if (!editing) return;
    const rule = editing.rule;
    // Limpa linhas incompletas antes de enviar.
    const cleaned: AutomationRule = {
      ...rule,
      name: rule.name.trim(),
      conditions: rule.conditions.filter((c) => c.field),
      actions: rule.actions.map((a) => (a.type === "add_checklist" ? { ...a, items: a.items.map((i) => i.trim()).filter(Boolean) } : a)),
    };
    if (!cleaned.name) return toast.error("Dê um nome à automação");
    const invalid = cleaned.actions.find(
      (a) =>
        (a.type === "set_field" && (!a.field || !a.value)) ||
        (a.type === "move_to_list" && !a.list) ||
        (a.type === "assign" && !a.userId) ||
        (a.type === "add_checklist" && !a.title.trim()) ||
        (a.type === "add_comment" && !a.text.trim())
    );
    if (invalid) return toast.error(`Complete a ação "${ACTION_LABELS[invalid.type]}"`);
    try {
      if (editing.id === null) await createMutation.mutateAsync({ boardId, rule: cleaned });
      else await updateMutation.mutateAsync({ boardId, id: editing.id, rule: cleaned });
      await refresh();
      setEditing(null);
      toast.success("Automação salva");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar a automação");
    }
  };

  const toggle = async (id: number, enabled: boolean) => {
    try {
      await updateMutation.mutateAsync({ boardId, id, enabled });
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível alterar a automação");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Excluir esta automação? O histórico dela também será apagado.")) return;
    try {
      await deleteMutation.mutateAsync({ boardId, id });
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível excluir");
    }
  };

  const patch = (change: Partial<AutomationRule>) => setEditing((prev) => (prev ? { ...prev, rule: { ...prev.rule, ...change } } : prev));
  const rule = editing?.rule;
  const saving = createMutation.isPending || updateMutation.isPending;
  const rules = data?.rules || [];
  const ruleName = (id: number) => rules.find((r) => r.id === id)?.name || "Regra removida";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && (setEditing(null), onClose())}>
      <DialogContent className="flex max-h-[92vh] w-[min(820px,96vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            {editing && (
              <button type="button" onClick={() => setEditing(null)} className="rounded-md p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground" aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Zap className="h-4 w-4 text-primary" />
            {editing ? (editing.id === null ? "Nova automação" : "Editar automação") : "Automações"}
          </DialogTitle>
          <DialogDescription>
            Regras no formato quando → se → então. Elas só agem nos cartões deste quadro.
          </DialogDescription>
        </DialogHeader>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : data && !data.ready ? (
            <p className="rounded-xl border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
              As automações ainda não foram habilitadas no banco de dados (migração 0011).
            </p>
          ) : editing && rule ? (
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Nome</label>
                <input className={fieldClass} value={rule.name} maxLength={120} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: Avisar sobre incidente crítico" />
              </div>

              {/* QUANDO */}
              <section className="rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Quando</h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select className={fieldClass} value={rule.trigger.type} onChange={(e) => patch({ trigger: { type: e.target.value as any } })}>
                    {TRIGGER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {TRIGGER_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  {rule.trigger.type === "card_moved" && (
                    <select className={fieldClass} value={rule.trigger.list || ""} onChange={(e) => patch({ trigger: { ...rule.trigger, list: e.target.value } })}>
                      <option value="">Qualquer lista</option>
                      {lists.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  )}
                  {rule.trigger.type === "field_changed" && (
                    <select className={fieldClass} value={rule.trigger.field || ""} onChange={(e) => patch({ trigger: { ...rule.trigger, field: e.target.value } })}>
                      <option value="">Qualquer campo</option>
                      {theme.fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {(rule.trigger.type === "due_soon" || rule.trigger.type === "stale") && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="number"
                        min={rule.trigger.type === "stale" ? 1 : 0}
                        max={365}
                        className={cn(fieldClass, "w-24")}
                        value={rule.trigger.days ?? (rule.trigger.type === "stale" ? 3 : 1)}
                        onChange={(e) => patch({ trigger: { ...rule.trigger, days: Number(e.target.value) } })}
                      />
                      dia(s)
                    </label>
                  )}
                </div>
                {["due_soon", "overdue", "stale"].includes(rule.trigger.type) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Gatilhos de tempo são verificados quando alguém abre o quadro, no máximo a cada 30 minutos, e agem uma vez por dia em cada cartão.
                  </p>
                )}
              </section>

              {/* SE */}
              <section className="rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Se (opcional)</h3>
                <div className="mt-2 space-y-2">
                  {rule.conditions.map((condition, index) => {
                    const setCondition = (change: Partial<typeof condition>) =>
                      patch({ conditions: rule.conditions.map((c, i) => (i === index ? { ...c, ...change } : c)) });
                    return (
                      <div key={index} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_10rem_1fr_auto]">
                        <select className={fieldClass} value={condition.field} onChange={(e) => setCondition({ field: e.target.value })}>
                          <option value="">Campo…</option>
                          {fieldOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <select className={cn(fieldClass, "col-start-1 sm:col-start-auto")} value={condition.op} onChange={(e) => setCondition({ op: e.target.value as any })}>
                          {CONDITION_OPS.map((op) => (
                            <option key={op} value={op}>
                              {OP_LABELS[op]}
                            </option>
                          ))}
                        </select>
                        {condition.op === "eq" || condition.op === "neq" ? (
                          <input className={cn(fieldClass, "col-start-1 sm:col-start-auto")} value={condition.value || ""} onChange={(e) => setCondition({ value: e.target.value })} placeholder="Valor" />
                        ) : (
                          <span className="hidden sm:block" />
                        )}
                        <button
                          type="button"
                          onClick={() => patch({ conditions: rule.conditions.filter((_, i) => i !== index) })}
                          className="col-start-2 row-start-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground sm:col-start-auto sm:row-start-auto"
                          aria-label="Remover condição"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {rule.conditions.length < 5 && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={() => patch({ conditions: [...rule.conditions, { field: "", op: "eq", value: "" }] })}>
                      <Plus className="h-4 w-4" /> Adicionar condição
                    </Button>
                  )}
                </div>
              </section>

              {/* ENTÃO */}
              <section className="rounded-xl border border-border p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Então</h3>
                <div className="mt-2 space-y-3">
                  {rule.actions.map((action, index) => {
                    const setAction = (next: AutomationAction) => patch({ actions: rule.actions.map((a, i) => (i === index ? next : a)) });
                    return (
                      <div key={index} className="rounded-lg bg-foreground/[0.03] p-2.5">
                        <div className="flex gap-2">
                          <select className={fieldClass} value={action.type} onChange={(e) => setAction(newAction(e.target.value as ActionType))}>
                            {ACTION_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {ACTION_LABELS[type]}
                              </option>
                            ))}
                          </select>
                          {rule.actions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => patch({ actions: rule.actions.filter((_, i) => i !== index) })}
                              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                              aria-label="Remover ação"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {action.type === "notify" && (
                            <>
                              <select className={fieldClass} value={action.target} onChange={(e) => setAction({ ...action, target: e.target.value as any })}>
                                {NOTIFY_TARGETS.map((target) => (
                                  <option key={target} value={target}>
                                    {TARGET_LABELS[target]}
                                  </option>
                                ))}
                              </select>
                              <input className={fieldClass} value={action.message || ""} maxLength={500} onChange={(e) => setAction({ ...action, message: e.target.value })} placeholder="Mensagem (opcional)" />
                            </>
                          )}
                          {action.type === "set_field" && (
                            <>
                              <select className={fieldClass} value={action.field} onChange={(e) => setAction({ ...action, field: e.target.value })}>
                                <option value="">Campo…</option>
                                {theme.fields.map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                              <input className={fieldClass} value={action.value} onChange={(e) => setAction({ ...action, value: e.target.value })} placeholder="Novo valor" />
                            </>
                          )}
                          {action.type === "move_to_list" && (
                            <select className={fieldClass} value={action.list} onChange={(e) => setAction({ ...action, list: e.target.value })}>
                              <option value="">Lista…</option>
                              {lists.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          )}
                          {action.type === "assign" && (
                            <select className={fieldClass} value={action.userId || ""} onChange={(e) => setAction({ ...action, userId: Number(e.target.value) })}>
                              <option value="">Pessoa…</option>
                              {people.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {action.type === "add_checklist" && (
                            <>
                              <input className={fieldClass} value={action.title} onChange={(e) => setAction({ ...action, title: e.target.value })} placeholder="Título do checklist" />
                              <textarea
                                className={cn(fieldClass, "h-24 py-2 sm:col-span-2")}
                                value={action.items.join("\n")}
                                onChange={(e) => setAction({ ...action, items: e.target.value.split("\n").slice(0, 20) })}
                                placeholder="Um item por linha"
                              />
                            </>
                          )}
                          {action.type === "add_comment" && (
                            <input className={cn(fieldClass, "sm:col-span-2")} value={action.text} maxLength={1000} onChange={(e) => setAction({ ...action, text: e.target.value })} placeholder="Texto do comentário" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {rule.actions.length < 5 && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={() => patch({ actions: [...rule.actions, newAction("notify")] })}>
                      <Plus className="h-4 w-4" /> Adicionar ação
                    </Button>
                  )}
                </div>
              </section>

              <p className="rounded-lg bg-foreground/[0.04] px-3 py-2 text-[13px] text-muted-foreground">{describeRule(rule, userName)}</p>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={save} disabled={saving} className="gap-1.5">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar automação
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="inline-flex h-8 items-center rounded-lg border border-input p-0.5">
                  {([
                    { key: "rules", label: `Regras (${rules.length})`, icon: Zap },
                    { key: "history", label: "Histórico", icon: History },
                  ] as const).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setTab(option.key)}
                      className={cn(
                        "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium",
                        tab === option.key ? "bg-foreground/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <option.icon className="h-3.5 w-3.5" /> {option.label}
                    </button>
                  ))}
                </div>
                {canManage && tab === "rules" && (
                  <Button size="sm" className="h-8 gap-1" onClick={() => setEditing({ id: null, rule: EMPTY_RULE })}>
                    <Plus className="h-4 w-4" /> Nova automação
                  </Button>
                )}
              </div>

              {tab === "rules" ? (
                <div className="space-y-2">
                  {rules.length === 0 && (
                    <p className="rounded-xl border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
                      Nenhuma automação neste quadro ainda.
                    </p>
                  )}
                  {rules.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                      <Switch checked={item.enabled} disabled={!canManage} onCheckedChange={(value) => toggle(item.id, value)} className="mt-0.5" aria-label="Ativar automação" />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm font-semibold", !item.enabled && "text-muted-foreground")}>{item.name}</p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">{describeRule(item as any, userName)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {item.runCount > 0
                            ? `Executada ${item.runCount} vez(es)${item.lastRunAt ? `, a última ${formatDistanceToNow(new Date(item.lastRunAt), { addSuffix: true, locale: ptBR })}` : ""}`
                            : "Ainda não executada"}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex flex-shrink-0 gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            aria-label="Editar"
                            onClick={() => setEditing({ id: item.id, rule: { name: item.name, trigger: item.trigger, conditions: item.conditions, actions: item.actions } })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Excluir" onClick={() => remove(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  {canManage && (
                    <div className="pt-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modelos para {theme.name}</h3>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {ruleTemplates(theme.key).map((template) => (
                          <button
                            key={template.name}
                            type="button"
                            onClick={() => setEditing({ id: null, rule: template })}
                            className="rounded-xl border border-dashed border-input p-3 text-left transition-colors hover:border-primary/50 hover:bg-foreground/[0.03]"
                          >
                            <span className="block text-sm font-medium">{template.name}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{describeRule(template)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(history || []).length === 0 && (
                    <p className="rounded-xl border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma execução registrada.</p>
                  )}
                  {(history || []).map((run) => (
                    <div key={run.id} className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px]">
                      {run.status === "ok" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-medium">{ruleName(run.automationId)}</span>
                          <span className="text-muted-foreground"> em “{run.cardTitle || `cartão ${run.cardId}`}”</span>
                        </p>
                        <p className="text-muted-foreground">
                          {run.status === "ok" ? "Feito" : "Erro"}: {run.detail || "—"}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
