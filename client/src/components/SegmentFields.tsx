import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { themeIcon } from "@/lib/themeIcons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBoardTheme, getFieldOptions, type BoardSettings, type ThemeField } from "@shared/boardThemes";

const EMPTY = "__vazio__";

/**
 * Campos específicos do segmento do quadro (E-commerce, CRM, SIEM/SOC, DEV).
 * Os valores ficam em card_custom_fields, a mesma tabela dos "Dados
 * Adicionais"; trocar o tema do quadro não apaga o que já foi preenchido.
 */
export default function SegmentFields({ cardId, boardId }: { cardId: number; boardId?: number }) {
  const utils = trpc.useUtils();
  const { data: board } = trpc.boards.get.useQuery({ id: boardId || 0 }, { enabled: !!boardId } as any);
  const { data: customFields } = trpc.cardDetails.getCustomFields.useQuery({ cardId }, { enabled: !!cardId } as any);
  const upsert = trpc.cardDetails.upsertCustomField.useMutation();

  const theme = getBoardTheme((board as any)?.theme);
  const settings = ((board as any)?.settings || {}) as BoardSettings;
  if (!boardId || theme.fields.length === 0) return null;

  const Icon = themeIcon(theme);
  const valueOf = (key: string): string =>
    ((customFields as any[]) || []).find((f) => (f.fieldName ?? f.field_name) === key)?.fieldValue ??
    ((customFields as any[]) || []).find((f) => (f.fieldName ?? f.field_name) === key)?.field_value ??
    "";

  const save = async (field: ThemeField, value: string) => {
    if (value === valueOf(field.key)) return;
    try {
      await upsert.mutateAsync({
        cardId,
        fieldName: field.key,
        fieldValue: value,
        fieldType: field.type === "datetime" ? "date" : field.type,
      });
      await Promise.all([
        utils.cardDetails.getCustomFields.invalidate({ cardId }),
        utils.cards.getByList.invalidate(),
      ]);
    } catch (error: any) {
      toast.error(error?.message || `Não foi possível salvar ${field.label}`);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${theme.palette.primary}22`, color: theme.palette.primary }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold leading-tight tracking-tight text-foreground">Campos de {theme.name}</h3>
          <p className="text-xs text-muted-foreground">Salvos automaticamente ao sair do campo.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {theme.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={valueOf(field.key)}
            options={getFieldOptions(theme, field, settings)}
            onSave={(value) => save(field, value)}
          />
        ))}
      </div>
    </section>
  );
}

function FieldInput({
  field,
  value,
  options,
  onSave,
}: {
  field: ThemeField;
  value: string;
  options: string[];
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const labelEl = (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{field.label}</label>
  );
  const inputClass =
    "h-10 w-full rounded-lg border border-[var(--surface-border)] bg-[var(--surface-3)] px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25";

  if (field.type === "select") {
    // Valor antigo que saiu da lista continua visível, para não sumir do cartão.
    const all = value && !options.includes(value) ? [value, ...options] : options;
    return (
      <div>
        {labelEl}
        <Select value={value || EMPTY} onValueChange={(next) => onSave(next === EMPTY ? "" : next)}>
          <SelectTrigger className="h-10 w-full rounded-lg border-[var(--surface-border)] bg-[var(--surface-3)] text-sm">
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY}>—</SelectItem>
            {all.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const type = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text";
  return (
    <div>
      {labelEl}
      <input
        type={type}
        value={draft}
        step={field.type === "number" ? "any" : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(draft.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(value);
        }}
        className={inputClass}
      />
    </div>
  );
}
