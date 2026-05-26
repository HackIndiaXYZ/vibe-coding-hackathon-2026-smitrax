# Telegram Approval

Telegram send requires:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `APPROVAL_HMAC_SECRET`
- `TELEGRAM_WEBHOOK_SECRET` when Telegram webhook secret-token validation is enabled

Approval messages include signed tokens:

```text
base64url(payload).base64url(hmac_sha256(payload, APPROVAL_HMAC_SECRET))
```

The webhook verifies:

- `X-Telegram-Bot-Api-Secret-Token` when `TELEGRAM_WEBHOOK_SECRET` is configured
- signature
- expiration
- chat allowlist
- pending approval state

Approval updates PatchPilot state only; merging remains disabled by default.

If `PATCHPILOT_APPLY_LOCAL_PATCH_ON_APPROVAL=true`, an approved local patch artifact can be applied to the original local folder. This is disabled by default.

Live Telegram send is implemented but credential-gated. Use `docs/verification/live-integrations.md` for the exact live-send checklist.
