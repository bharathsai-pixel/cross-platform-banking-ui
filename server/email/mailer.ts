/**
 * server/email/mailer.ts
 *
 * Nodemailer transport factory.
 *
 * Configuration (set in .env):
 *   EMAIL_HOST      SMTP hostname          e.g. smtp.gmail.com
 *   EMAIL_PORT      SMTP port              e.g. 587
 *   EMAIL_SECURE    "true" for port 465    "false" for STARTTLS
 *   EMAIL_USER      SMTP username / address
 *   EMAIL_PASS      SMTP password or app-password
 *   EMAIL_FROM      Sender display name + address
 *   APP_URL         Public base URL        e.g. https://nexuspay.com
 *
 * For local dev without a real SMTP server set EMAIL_DEV_PREVIEW=true
 * and the reset URL will be logged to the console instead.
 */

import nodemailer, { type Transporter } from "nodemailer";

function createTransport(): Transporter {
  // If dev-preview mode just use a throw-away ethereal account or console log
  if (process.env.EMAIL_DEV_PREVIEW === "true") {
    // nodemailer ethereal auto-account — works offline, no real email sent
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER ?? "preview@ethereal.email",
        pass: process.env.EMAIL_PASS ?? "preview",
      },
    });
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST ?? "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT ?? 587),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const transport = createTransport();

const FROM_ADDRESS =
  process.env.EMAIL_FROM ?? "NexusPay <no-reply@nexuspay.com>";

export async function sendPasswordResetEmail(
  toEmail: string,
  firstName: string,
  resetUrl: string
): Promise<void> {
  // In dev mode without real SMTP, print to console so you can test the flow
  if (
    !process.env.EMAIL_HOST &&
    process.env.EMAIL_DEV_PREVIEW !== "true"
  ) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[EMAIL] Password reset link (dev — no SMTP configured):");
    console.log(`  To:  ${toEmail}`);
    console.log(`  URL: ${resetUrl}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your NexusPay password</title>
</head>
<body style="margin:0;padding:0;background:#f6f8fb;font-family:'DM Sans',Arial,sans-serif;color:#263751;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6ecf3;box-shadow:0 8px 24px rgba(11,35,66,.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d2d51 0%,#174b80 100%);padding:28px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:38px;height:38px;background:#ef705e;border-radius:12px 12px 12px 3px;text-align:center;vertical-align:middle;transform:rotate(-7deg);">
                    <span style="color:white;font-size:24px;font-weight:800;display:inline-block;transform:rotate(7deg);">N</span>
                  </td>
                  <td style="padding-left:12px;">
                    <div style="color:white;font-size:18px;font-weight:800;letter-spacing:-0.7px;">Nexus<span style="color:#8db7fc;">Pay</span></div>
                    <div style="color:#8097b6;font-size:9px;text-transform:uppercase;letter-spacing:1.2px;margin-top:4px;">Banking &amp; FinTech Platform</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#10223b;letter-spacing:-0.5px;">Reset your password</h1>
              <p style="margin:0 0 20px;font-size:14px;color:#6b7d93;line-height:1.6;">
                Hi ${firstName}, we received a request to reset the password for your NexusPay account.
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b7d93;line-height:1.6;">
                Click the button below to choose a new password. This link expires in <strong style="color:#10223b;">1 hour</strong>.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#2d73db;border-radius:10px;box-shadow:0 7px 16px rgba(45,115,219,.28);">
                    <a href="${resetUrl}" style="display:inline-block;color:white;font-size:14px;font-weight:700;text-decoration:none;padding:14px 28px;letter-spacing:0.1px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;font-size:12px;color:#8a99ad;line-height:1.6;">
                If the button doesn't work, paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;font-size:11px;word-break:break-all;">
                <a href="${resetUrl}" style="color:#2d73db;">${resetUrl}</a>
              </p>

              <hr style="border:0;border-top:1px solid #e6ecf3;margin:0 0 20px;" />

              <p style="margin:0;font-size:12px;color:#a7b2c0;line-height:1.6;">
                If you didn't request a password reset you can safely ignore this email — your password will not change.
                For security questions contact <a href="mailto:support@nexuspay.com" style="color:#2d73db;">support@nexuspay.com</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f6f8fb;padding:16px 32px;border-top:1px solid #e6ecf3;">
              <p style="margin:0;font-size:10px;color:#a7b2c0;">
                © ${new Date().getFullYear()} NexusPay. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `
Hi ${firstName},

We received a request to reset the password on your NexusPay account.

Reset your password here (link expires in 1 hour):
${resetUrl}

If you didn't request this, you can safely ignore this email.

— The NexusPay Team
`.trim();

  const info = await transport.sendMail({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: "Reset your NexusPay password",
    text,
    html,
  });

  console.log(`[EMAIL] Password reset sent to ${toEmail} — Message-ID: ${info.messageId}`);
  // For ethereal dev preview
  if (process.env.EMAIL_DEV_PREVIEW === "true") {
    const previewUrl = (await import("nodemailer")).default.getTestMessageUrl(info);
    if (previewUrl) console.log(`[EMAIL] Preview URL: ${previewUrl}`);
  }
}
