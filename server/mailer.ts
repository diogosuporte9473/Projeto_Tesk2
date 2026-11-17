import nodemailer from "nodemailer";

/**
 * Envio de e-mail por SMTP.
 *
 * Fica desligado até as variáveis SMTP_HOST, SMTP_USER, SMTP_PASS e EMAIL_FROM
 * serem configuradas no servidor (Vercel). Desligado, nada é enviado e as telas
 * dizem isso: o app não finge que mandou um e-mail.
 */

function smtpConfig() {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS || "";
  const from = (process.env.EMAIL_FROM || user).trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return { host, user, pass, from, port, secure };
}

export function emailConfigured(): boolean {
  const cfg = smtpConfig();
  return Boolean(cfg.host && cfg.user && cfg.pass && cfg.from);
}

/** Endereço público do app, usado nos links dos e-mails. */
export function appUrl(req?: { headers?: Record<string, any> }): string {
  const fromEnv = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const headers = req?.headers || {};
  const host = headers["x-forwarded-host"] || headers.host;
  if (host) {
    const proto = headers["x-forwarded-proto"] || (String(host).startsWith("localhost") ? "http" : "https");
    return `${String(proto).split(",")[0]}://${String(host).split(",")[0]}`;
  }
  return "";
}

/** Só e-mails de verdade: contas antigas usam um domínio interno que não recebe mensagens. */
export function isDeliverableEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith("@projeto-maju.com");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Modelo único e neutro (serve a todas as empresas). */
export function renderEmail(opts: {
  title: string;
  lines: string[];
  actionLabel?: string;
  actionUrl?: string;
  footer?: string;
}): { html: string; text: string } {
  const paragraphs = opts.lines
    .map((line) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155">${escapeHtml(line)}</p>`)
    .join("");
  const button =
    opts.actionUrl && opts.actionLabel
      ? `<p style="margin:20px 0"><a href="${escapeHtml(opts.actionUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(opts.actionLabel)}</a></p>`
      : "";
  const footer = escapeHtml(opts.footer || "Você recebeu este e-mail porque tem uma conta no DStasks.");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 28px 8px;font-size:13px;font-weight:700;color:#0891b2;letter-spacing:.04em">DSTASKS</td></tr>
<tr><td style="padding:0 28px 24px"><h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${escapeHtml(opts.title)}</h1>${paragraphs}${button}
${opts.actionUrl ? `<p style="margin:0;font-size:12px;color:#64748b;word-break:break-all">Se o botão não funcionar, copie este endereço: ${escapeHtml(opts.actionUrl)}</p>` : ""}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">${footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [opts.title, "", ...opts.lines, ...(opts.actionUrl ? ["", `${opts.actionLabel || "Abrir"}: ${opts.actionUrl}`] : []), "", opts.footer || ""]
    .join("\n")
    .trim();
  return { html, text };
}

/** Envia um e-mail. Nunca lança: devolve false se não estiver configurado ou falhar. */
export async function sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  if (!emailConfigured() || !isDeliverableEmail(message.to)) return false;
  const cfg = smtpConfig();
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    await transport.sendMail({ from: cfg.from, to: message.to, subject: message.subject, html: message.html, text: message.text });
    return true;
  } catch (err: any) {
    console.error("[Mailer] Falha ao enviar e-mail:", err?.message || err);
    return false;
  }
}
