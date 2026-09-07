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
 * Builds password reset email HTML.
 *
 * @param params Template parameters for reset URL, brand name, and expiration time.
 * @returns Rendered password reset email HTML string.
 *
 * @example
 * ```typescript
 * const html = buildPasswordResetEmailTemplate({
 *   resetUrl: 'https://app.example.com/reset-password?token=abc123',
 *   brandName: 'My App',
 *   expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
 * });
 * ```
 */
export function buildPasswordResetEmailTemplate(params: {
  resetUrl: string;
  brandName?: string;
  expiresAt?: string | Date;
}): string {
  const expires =
    params.expiresAt instanceof Date
      ? params.expiresAt.toISOString()
      : (params.expiresAt ?? '1 hour');

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Password Reset</title>
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
                  Password Reset
                </div>
                <h1 style="margin:0 0 10px 0;font-size:26px;line-height:1.25;font-weight:700;color:#fafafa;">
                  Reset your password
                </h1>
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#cbd5e1;">
                  You requested to reset your password. Click the button below to set a new password. This link will expire in 1 hour.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#60a5fa,#22d3ee);">
                      <a href="${escapeHtml(params.resetUrl)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:#0b1120;text-decoration:none;border-radius:10px;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#a1a1aa;">
                  Reset link expires at:
                </p>
                <p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;color:#f4f4f5;font-weight:600;">
                  ${escapeHtml(expires)}
                </p>
                <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#a1a1aa;">
                  If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
                  If the button does not work, copy and paste this link into your browser:<br />
                  <a href="${escapeHtml(params.resetUrl)}" style="color:#7dd3fc;text-decoration:underline;word-break:break-all;">${escapeHtml(params.resetUrl)}</a>
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
