/**
 * Escapes unsafe HTML characters from dynamic content.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Builds invitation email HTML.
 * @param params Template parameters for URL, tenant name, brand name, and expiration time.
 * @returns Rendered invitation email HTML string.
 */
export function buildInvitationEmailTemplate(params: {
  invitationUrl: string;
  tenantName: string;
  brandName?: string;
  expiresAt?: string | Date;
}): string {
  const expires =
    params.expiresAt instanceof Date
      ? params.expiresAt.toISOString()
      : (params.expiresAt ?? '7 days');

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Invitation</title>
  </head>
  <body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#09090b;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding:0 0 14px 4px;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;font-weight:600;">
                  ${escapeHtml(params.brandName ?? 'Monorepo Starter Kit')}
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#111113;border:1px solid #27272a;border-radius:16px;padding:28px 26px;">
                <div style="display:inline-block;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;border:1px solid #334155;border-radius:999px;padding:4px 10px;margin-bottom:14px;">
                  Invitation
                </div>
                <h1 style="margin:0 0 10px 0;font-size:26px;line-height:1.25;font-weight:700;color:#fafafa;">
                  You are invited to join ${escapeHtml(params.tenantName)}
                </h1>
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#cbd5e1;">
                  An administrator has invited you to your workspace. Accept the invitation to get secure access to your member dashboard.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#60a5fa,#22d3ee);">
                      <a href="${escapeHtml(params.invitationUrl)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:#0b1120;text-decoration:none;border-radius:10px;">
                        Accept invitation
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#a1a1aa;">
                  Invitation expires at:
                </p>
                <p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;color:#f4f4f5;font-weight:600;">
                  ${escapeHtml(expires)}
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
                  If the button does not work, copy and paste this link into your browser:<br />
                  <a href="${escapeHtml(params.invitationUrl)}" style="color:#7dd3fc;text-decoration:underline;word-break:break-all;">${escapeHtml(params.invitationUrl)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
}
