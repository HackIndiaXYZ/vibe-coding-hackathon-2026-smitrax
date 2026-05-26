import { getEnv } from "./env";
import { PatchPilotError } from "./errors";

export async function sendTelegramApproval(input: { chatId: string; text: string; replyMarkup?: unknown }): Promise<{ messageId: string }> {
  const token = getEnv("TELEGRAM_BOT_TOKEN");
  if (!token) throw new PatchPilotError("telegram_not_configured", "Set TELEGRAM_BOT_TOKEN to send approval requests.", { requiredEnv: "TELEGRAM_BOT_TOKEN" });
  const bodyPayload: Record<string, unknown> = {
    chat_id: input.chatId,
    text: input.text
  };
  if (input.replyMarkup) bodyPayload.reply_markup = input.replyMarkup;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyPayload)
  });
  const body = (await response.json()) as { ok: boolean; result?: { message_id: number }; description?: string; error_code?: number };
  if (!response.ok || !body.ok || !body.result) {
    throw new PatchPilotError("telegram_send_failed", "Telegram API did not send the approval message.", {
      method: "sendMessage",
      status: response.status,
      error_code: body.error_code,
      description: body.description,
      chat_id: redactTelegramChatId(input.chatId)
    }, 502);
  }
  return { messageId: String(body.result.message_id) };
}

export function redactTelegramChatId(chatId: string): string {
  const value = String(chatId);
  if (value.length <= 4) return "***";
  return `***${value.slice(-4)}`;
}

export function validateTelegramWebhookSecret(headerValue: string | null | undefined): void {
  const expected = getEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!expected) return;
  if (!headerValue) {
    throw new PatchPilotError("telegram_webhook_secret_missing", "Telegram webhook secret header is required.", { header: "X-Telegram-Bot-Api-Secret-Token" }, 401);
  }
  if (headerValue !== expected) {
    throw new PatchPilotError("telegram_webhook_secret_invalid", "Telegram webhook secret header is invalid.", { header: "X-Telegram-Bot-Api-Secret-Token" }, 403);
  }
}
