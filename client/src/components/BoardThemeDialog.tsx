import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { themeIcon } from "@/lib/themeIcons";
import {
  BOARD_THEMES,
  SEGMENT_THEME_KEYS,
  getBoardTheme,
  normalizeSettingList,
  type BoardSettingListKey,
  type BoardSettings,
  type BoardTheme,
  type BoardThemeKey,
} from "@shared/boardThemes";

interface BoardThemeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: number;
  currentTheme: BoardThemeKey;
  currentSettings: BoardSettings;
  existingLists: string[];
}

/** Configurações do quadro → Personalizar tema. */
export default function BoardThemeDialog({
  isOpen,
  onClose,
  boardId,
  currentTheme,
  currentSettings,
  existingLists,
}: BoardThemeDialogProps) {
  const utils = trpc.useUtils();
  const setThemeMutation = trpc.boards.setTheme.useMutation();

  const [selected, setSelected] = useState<BoardThemeKey>(currentTheme);
  const [createLists, setCreateLists] = useState(false);
  const [lists, setLists] = useState<BoardSettings>({});
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelected(currentTheme);
    setCreateLists(false);
    setLists(currentSettings || {});
    setDraft("");
  }, [isOpen, currentTheme, currentSettings]);

  const theme = getBoardTheme(selected);
  const options: BoardThemeKey[] = ["general", ...SEGMENT_THEME_KEYS];

  const missingLists = useMemo(() => {
    const have = new Set(existingLists.map((name) => name.trim().toLowerCase()));
    return theme.lists.filter((name) => !have.has(name.toLowerCase()));
  }, [theme, existingLists]);

  const valuesOf = (key: BoardSettingListKey, fallback: string[]) => lists[key] ?? fallback;

  const addItem = (key: BoardSettingListKey, fallback: string[]) => {
    const next = normalizeSettingList([...valuesOf(key, fallback), draft]);
    setLists((prev) => ({ ...prev, [key]: next }));
    setDraft("");
  };

  const removeItem = (key: BoardSettingListKey, fallback: string[], item: string) => {
    setLists((prev) => ({ ...prev, [key]: valuesOf(key, fallback).filter((v) => v !== item) }));
  };

  const handleSave = async () => {
    // Só envia as listas editáveis do tema escolhido.
    const settings: BoardSettings = {};
    for (const list of theme.editableLists) {
      settings[list.key] = normalizeSettingList(valuesOf(list.key, list.examples));
    }
    try {
      const result = await setThemeMutation.mutateAsync({
        id: boardId,
        theme: selected,
        createSuggestedLists: createLists && missingLists.length > 0,
        settings,
      });
      await Promise.all([
        utils.boards.get.invalidate({ id: boardId }),
        utils.boards.list.invalidate(),
        utils.lists.getByBoard.invalidate({ boardId }),
      ]);
      toast.success(
        result.createdLists.length > 0
          ? `Tema ${theme.name} aplicado; ${result.createdLists.length} lista(s) criada(s)`
          : `Tema ${theme.name} aplicado`
      );
      onClose();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível alterar o tema");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[min(960px,96vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Personalizar tema</DialogTitle>
          <DialogDescription>
            O tema adapta o quadro a um segmento: fluxo sugerido, campos, categorias e indicadores. Trocar de tema não
            altera nem apaga os cartões.
          </DialogDescription>
        </DialogHeader>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {options.map((key) => (
              <ThemeCard
                key={key}
                theme={BOARD_THEMES[key]}
                selected={selected === key}
                current={currentTheme === key}
                onSelect={() => {
                  setSelected(key);
                  setDraft("");
                }}
              />
            ))}
          </div>

          <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Fluxo sugerido</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Listas do Kanban, na ordem do processo.</p>
              <ol className="mt-2 flex flex-wrap gap-1.5">
                {theme.lists.map((name, index) => (
                  <li
                    key={name}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      missingLists.includes(name) ? "border-dashed border-input text-muted-foreground" : "border-border bg-foreground/[0.05]"
                    )}
                    title={missingLists.includes(name) ? "Ainda não existe neste quadro" : "Já existe neste quadro"}
                  >
                    {index + 1}. {name}
                  </li>
                ))}
              </ol>

              {missingLists.length > 0 && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                    checked={createLists}
                    onChange={(e) => setCreateLists(e.target.checked)}
                  />
                  <span>
                    Criar as {missingLists.length} lista(s) que faltam
                    <span className="block text-xs text-muted-foreground">
                      As listas atuais e seus cartões permanecem como estão; as novas entram no fim do quadro.
                    </span>
                  </span>
                </label>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold">Campos do segmento</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {theme.fields.length > 0
                  ? "Campos específicos previstos para os cartões deste tema."
                  : "O tema Geral não acrescenta campos."}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {theme.fields.map((field) => (
                  <span key={field.key} className="rounded-md bg-foreground/[0.06] px-2 py-1 text-xs">
                    {field.label}
                  </span>
                ))}
              </div>
              {theme.classifications.map((group) => (
                <p key={group.label} className="mt-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{group.label}:</span> {group.options.join(" · ")}
                </p>
              ))}
            </div>
          </section>

          {theme.editableLists.map((list) => {
            const values = valuesOf(list.key, list.examples);
            return (
              <section key={list.key} className="mt-5 rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">{list.label}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{list.help}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {values.map((item) => (
                    <span key={item} className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.07] py-1 pl-2 pr-1 text-xs">
                      {item}
                      <button
                        type="button"
                        onClick={() => removeItem(list.key, list.examples, item)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                        aria-label={`Remover ${item}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {values.length === 0 && <span className="text-xs text-muted-foreground">Nenhum item. Adicione abaixo.</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={draft}
                    maxLength={60}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draft.trim()) {
                        e.preventDefault();
                        addItem(list.key, list.examples);
                      }
                    }}
                    placeholder="Novo nome…"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-9 gap-1" disabled={!draft.trim()} onClick={() => addItem(list.key, list.examples)}>
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>
              </section>
            );
          })}

          {(theme.indicators.length > 0 || theme.automations.length > 0) && (
            <p className="mt-5 text-xs text-muted-foreground">
              Indicadores e automações deste segmento ({theme.indicators.length} e {theme.automations.length} previstos) chegam nas
              próximas fases; por enquanto o tema define fluxo, campos e ajustes do quadro.
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={setThemeMutation.isPending} className="gap-1.5">
            {setThemeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {selected === currentTheme ? "Salvar ajustes" : `Aplicar tema ${theme.name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThemeCard({
  theme,
  selected,
  current,
  onSelect,
}: {
  theme: BoardTheme;
  selected: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  const Icon = themeIcon(theme);
  const { primary, secondary } = theme.palette;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border text-left transition-all",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50"
      )}
    >
      {/* Prévia do quadro com a paleta do tema */}
      <span className="relative block h-20 w-full" style={{ background: `linear-gradient(135deg, ${primary}33, ${secondary}26)` }}>
        <span className="absolute inset-x-2 bottom-0 top-2 flex gap-1">
          {[3, 2, 1].map((cards, column) => (
            <span key={column} className="flex flex-1 flex-col gap-1 rounded-t-md bg-background/70 p-1">
              <span className="h-1 w-2/3 rounded-full" style={{ backgroundColor: column === 0 ? primary : secondary }} />
              {Array.from({ length: cards }).map((_, i) => (
                <span key={i} className="h-2.5 rounded-sm bg-foreground/15" />
              ))}
            </span>
          ))}
        </span>
        {selected && (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col p-3">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${primary}26`, color: primary }}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">{theme.name}</span>
        </span>
        <span className="mt-1.5 text-xs leading-snug text-muted-foreground">{theme.description}</span>
        <span className="mt-2 space-y-0.5">
          {theme.features.map((feature) => (
            <span key={feature} className="flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
              <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: primary }} />
              {feature}
            </span>
          ))}
        </span>
        <span className={cn("mt-3 text-[11px] font-semibold", selected ? "text-primary" : "text-muted-foreground")}>
          {current ? "Tema atual" : selected ? "Selecionado" : "Selecionar"}
        </span>
      </span>
    </button>
  );
}
