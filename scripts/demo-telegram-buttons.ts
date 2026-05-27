import {
  type ProviderReadiness,
  buildFailoverConsentMessage,
  inlineKeyboard,
  sendTelegramApproval,
  telegramCallbackData
} from "../packages/core/src/index.ts";
import { loadDotenvFile, requiredEnv, safeJson, telegramChatId } from "./live-utils.ts";

loadDotenvFile();

// Sends one real Telegram message per scenario with the exact inline keyboards the
// product uses, so you can see how taps look. Tapping fully works only when the
// webhook is publicly reachable (set TELEGRAM_WEBHOOK_SECRET + a tunnel + setWebhook);
// otherwise this is a faithful visual preview. No real remediation is triggered here.
async function main() {
  requiredEnv("TELEGRAM_BOT_TOKEN");
  const chatId = telegramChatId();
  const sent: Array<{ scenario: string; messageId: string; buttons: string[] }> = [];

  // 1) Remediation approval
  {
    const approvalId = "appr_demo000001";
    const text = [
      "PatchPilot approval needed",
      "",
      "Project: patchpilot-demo",
      "Package: lodash",
      "Risk: 78/100 high",
      "Fix: 4.17.20 -> 4.17.21",
      "PR: https://github.com/MokiMeow/PATCHPILOT_TEST_REPO/pull/8",
      "",
      "Tap a button below. Nothing is merged or deployed automatically."
    ].join("\n");
    const buttons = inlineKeyboard([[
      { text: "✅ Approve", callbackData: telegramCallbackData("a", approvalId, "approve") },
      { text: "❌ Reject", callbackData: telegramCallbackData("a", approvalId, "reject") }
    ]]);
    const result = await sendTelegramApproval({ chatId, text, replyMarkup: buttons });
    sent.push({ scenario: "remediation_approval", messageId: result.messageId, buttons: ["✅ Approve", "❌ Reject"] });
  }

  // 2) Provider failover consent
  {
    const consentId = "pcon_demo000001";
    const readiness: ProviderReadiness[] = [
      { provider: "codex", status: "quota_limited", trust: "codex", lastCheckedAt: new Date().toISOString(), failureReason: "usage limit" },
      { provider: "openrouter", status: "not_configured", trust: "cloud", lastCheckedAt: new Date().toISOString() },
      { provider: "anthropic", status: "not_configured", trust: "cloud", lastCheckedAt: new Date().toISOString() },
      { provider: "grok", status: "endpoint_unreachable", trust: "cloud", lastCheckedAt: new Date().toISOString() },
      { provider: "ollama", model: "qwen2.5-coder:7b", status: "ready", trust: "local", lastCheckedAt: new Date().toISOString(), latencyMs: 421 },
      { provider: "deterministic", status: "ready", trust: "deterministic", lastCheckedAt: new Date().toISOString() }
    ];
    const candidate = readiness.find((entry) => entry.provider === "ollama")!;
    const text = buildFailoverConsentMessage(readiness, candidate);
    const buttons = inlineKeyboard([
      [{ text: "✅ Allow once", callbackData: telegramCallbackData("c", consentId, "allow_once") }],
      [{ text: "🔓 Always allow this repo", callbackData: telegramCallbackData("c", consentId, "always_allow_repo") }],
      [{ text: "🛠 Use deterministic fix", callbackData: telegramCallbackData("c", consentId, "use_deterministic") }],
      [{ text: "❌ Reject", callbackData: telegramCallbackData("c", consentId, "reject") }]
    ]);
    const result = await sendTelegramApproval({ chatId, text, replyMarkup: buttons });
    sent.push({ scenario: "provider_failover_consent", messageId: result.messageId, buttons: ["Allow once", "Always allow this repo", "Use deterministic fix", "Reject"] });
  }

  // 3) Watch-mode alert
  {
    const findingId = "find_demo000001";
    const text = [
      "PatchPilot watch alert",
      "",
      "Project: patchpilot-demo",
      "Package: lodash@4.17.20",
      "Risk: 78/100 high",
      "Fix: update to 4.17.21",
      "",
      "New vulnerability found. Start remediation? (review in PatchPilot — watch mode never patches automatically)"
    ].join("\n");
    const buttons = inlineKeyboard([[
      { text: "🚀 Start remediation", callbackData: telegramCallbackData("w", findingId, "start") },
      { text: "🔕 Dismiss", callbackData: telegramCallbackData("w", findingId, "dismiss") }
    ]]);
    const result = await sendTelegramApproval({ chatId, text, replyMarkup: buttons });
    sent.push({ scenario: "watch_alert", messageId: result.messageId, buttons: ["🚀 Start remediation", "🔕 Dismiss"] });
  }

  console.log(safeJson({
    ok: true,
    chat: "***redacted***",
    sent,
    note: "Three messages sent with inline buttons. Taps execute only if the webhook is publicly reachable (TELEGRAM_WEBHOOK_SECRET + tunnel + setWebhook); otherwise this is a visual preview."
  }));
}

main().catch((error) => {
  console.error(safeJson({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
