import { Code2, Handshake, LayoutGrid, ShieldAlert, ShoppingCart, type LucideIcon } from "lucide-react";
import type { BoardTheme } from "@shared/boardThemes";

/** Ícone de cada segmento. Tema novo sem ícone mapeado usa o genérico. */
const ICONS: Record<string, LucideIcon> = {
  layout: LayoutGrid,
  cart: ShoppingCart,
  handshake: Handshake,
  shield: ShieldAlert,
  code: Code2,
};

export function themeIcon(theme: Pick<BoardTheme, "icon">): LucideIcon {
  return ICONS[theme.icon] ?? LayoutGrid;
}
