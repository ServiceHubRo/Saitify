import { appendFile } from 'node:fs/promises';

export type Mail = { to: string; subject: string; text: string; html?: string };
export type MailResult = { delivered: true } | { delivered: false; reason: 'not_configured' | 'provider_error' };

export interface Mailer {
  readonly configured: boolean;
  send(mail: Mail): Promise<MailResult>;
}

/** No transport configured: we say so honestly instead of pretending to send. */
export const unconfiguredMailer: Mailer = {
  configured: false,
  async send() {
    return { delivered: false, reason: 'not_configured' };
  },
};

export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    configured: true,
    async send(mail) {
      try {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
        });
        return res.ok ? { delivered: true } : { delivered: false, reason: 'provider_error' };
      } catch {
        return { delivered: false, reason: 'provider_error' };
      }
    },
  };
}

/** Development/test transport: appends JSON lines to a file so automated tests can read links. Never selected by default. */
export function outboxMailer(file: string): Mailer {
  return {
    configured: true,
    async send(mail) {
      await appendFile(file, `${JSON.stringify({ ...mail, at: Date.now() })}\n`);
      return { delivered: true };
    },
  };
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.EMAIL_TRANSPORT === 'outbox' && env.EMAIL_OUTBOX_FILE) {
    if (env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME) throw new Error('The file outbox transport cannot be used on a serverless host.');
    return outboxMailer(env.EMAIL_OUTBOX_FILE);
  }
  const key = env.RESEND_API_KEY || env.CONTACT_RESEND_API_KEY;
  const from = env.EMAIL_FROM || env.CONTACT_FROM_EMAIL;
  if (key && from) return resendMailer(key, from);
  return unconfiguredMailer;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderMail(opts: { preheader: string; title: string; paragraphs: string[]; action?: { label: string; url: string }; footer: string }): { text: string; html: string } {
  const text = [opts.title, '', ...opts.paragraphs, ...(opts.action ? ['', `${opts.action.label}: ${opts.action.url}`] : []), '', opts.footer].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Inter,Arial,sans-serif;color:#0b1020"><span style="display:none">${esc(opts.preheader)}</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:32px"><tr><td><p style="font-size:20px;font-weight:700;margin:0 0 16px">Saitlify</p><h1 style="font-size:22px;margin:0 0 16px">${esc(opts.title)}</h1>${opts.paragraphs.map((p) => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${esc(p)}</p>`).join('')}${opts.action ? `<p style="margin:24px 0"><a href="${esc(opts.action.url)}" style="background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:999px;display:inline-block">${esc(opts.action.label)}</a></p><p style="font-size:13px;color:#475569;word-break:break-all">Or paste this link into your browser: ${esc(opts.action.url)}</p>` : ''}<p style="font-size:13px;color:#475569;margin-top:24px">${esc(opts.footer)}</p></td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
