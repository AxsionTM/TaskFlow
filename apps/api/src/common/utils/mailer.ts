import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

function isMailConfigured(): boolean {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }
  return transporter;
}

export function isEmailConfigured(): boolean {
  return isMailConfigured();
}

interface SendCodeParams {
  to: string;
  code: string;
  kind: 'verify' | 'reset';
}

const SUBJECTS = {
  verify: 'TaskFlow — код подтверждения почты',
  reset: 'TaskFlow — код восстановления пароля',
} as const;

/**
 * Отправка кода. Возвращает { sent: true } при реальной отправке через SMTP.
 * Если SMTP не настроен и окружение не production — код пишется в лог,
 * а сам код возвращается в поле devCode, чтобы flow можно было
 * протестировать локально без почтового сервера.
 */
export async function sendVerificationCode({
  to,
  code,
  kind,
}: SendCodeParams): Promise<{ sent: boolean; devCode?: string }> {
  if (!isMailConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Email requested but SMTP is not configured (EMAIL_HOST/EMAIL_USERNAME/EMAIL_PASSWORD)');
      return { sent: false };
    }
    console.log(`[dev-mail] ${kind} code for ${to}: ${code}`);
    return { sent: false, devCode: code };
  }

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME!;
  const title = kind === 'verify' ? 'Подтверждение почты' : 'Восстановление пароля';
  const text =
    kind === 'verify'
      ? `Ваш код подтверждения TaskFlow: ${code}\nКод действует 15 минут. Никому его не сообщайте.`
      : `Ваш код восстановления пароля TaskFlow: ${code}\nКод действует 15 минут. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.`;

  await getTransporter().sendMail({
    from,
    to,
    subject: SUBJECTS[kind],
    text,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px">TaskFlow — ${title}</h2>
      <p style="color:#555">Ваш одноразовый код:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;background:#f4f4f5;border-radius:12px">${code}</div>
      <p style="color:#888;font-size:13px">Код действует 15 минут и сгорает после использования. Никому его не сообщайте.</p>
    </div>`,
  });

  return { sent: true };
}
