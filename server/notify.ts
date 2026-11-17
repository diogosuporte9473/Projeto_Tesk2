import { supabase } from "./_core/supabase.js";
import { appUrl, emailConfigured, isDeliverableEmail, renderEmail, sendEmail } from "./mailer.js";

/** Preferência de e-mail (tabela user_preferences) que controla cada tipo de aviso. */
export type EmailPref = "email_on_card_assigned" | "email_on_card_updated" | "email_on_due_date";

export type NotifyInput = {
  userIds: number[];
  /** Empresa do quadro: só recebe quem é dela (ou o super administrador). */
  tenantId: string;
  type: string;
  title: string;
  message?: string;
  cardId?: number | null;
  boardId?: number | null;
  /** Quem causou o aviso não é avisado de si mesmo. */
  excludeUserId?: number | null;
  /** Sem preferência, o aviso fica só dentro do app. */
  emailPref?: EmailPref | null;
};

/** Link direto para o cartão (o quadro abre o cartão pelo parâmetro ?card=). */
export function cardLink(boardId?: number | null, cardId?: number | null): string {
  const base = appUrl();
  if (!base || !boardId) return base;
  return `${base}/board/${boardId}${cardId ? `?card=${cardId}` : ""}`;
}

/**
 * Cria avisos dentro do app e, quando o envio de e-mail está configurado e o
 * usuário não desligou a preferência, manda também por e-mail.
 * Lança se não conseguir gravar os avisos; falha de e-mail não interrompe nada.
 */
export async function notifyUsers(input: NotifyInput): Promise<{ notified: number; emailed: number }> {
  const ids = Array.from(new Set(input.userIds.filter((id) => typeof id === "number" && id !== input.excludeUserId)));
  if (ids.length === 0) return { notified: 0, emailed: 0 };

  const { data: rows } = await supabase.from("users").select("*").in("id", ids);
  const recipients = ((rows || []) as any[]).filter(
    (u) => !u.disabled_at && (u.tenant_id === input.tenantId || u.role === "master_admin")
  );
  if (recipients.length === 0) return { notified: 0, emailed: 0 };

  const { error } = await supabase.from("notifications").insert(
    recipients.map((u) => ({
      user_id: u.id,
      tenant_id: input.tenantId,
      type: input.type,
      related_card_id: input.cardId ?? null,
      related_board_id: input.boardId ?? null,
      title: input.title.slice(0, 255),
      message: input.message ?? null,
    }))
  );
  if (error) throw new Error(`notificar: ${error.message}`);

  let emailed = 0;
  if (input.emailPref && emailConfigured()) {
    const withEmail = recipients.filter((u) => isDeliverableEmail(u.username));
    if (withEmail.length > 0) {
      const { data: prefs } = await supabase.from("user_preferences").select("*").in("user_id", withEmail.map((u) => u.id));
      const optedOut = new Set(
        ((prefs || []) as any[]).filter((p) => p[input.emailPref as string] === false).map((p) => p.user_id)
      );
      const link = cardLink(input.boardId, input.cardId);
      const { html, text } = renderEmail({
        title: input.title,
        lines: input.message ? [input.message] : [],
        actionLabel: input.cardId ? "Abrir cartão" : "Abrir o DStasks",
        actionUrl: link || undefined,
        footer: "Para deixar de receber estes e-mails, ajuste as preferências em Configurações → Notificações.",
      });
      const results = await Promise.allSettled(
        withEmail
          .filter((u) => !optedOut.has(u.id))
          .map((u) => sendEmail({ to: u.username, subject: input.title.slice(0, 150), html, text }))
      );
      emailed = results.filter((r) => r.status === "fulfilled" && r.value).length;
    }
  }

  return { notified: recipients.length, emailed };
}

/** Recorte curto de um texto para avisos. */
export function excerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
