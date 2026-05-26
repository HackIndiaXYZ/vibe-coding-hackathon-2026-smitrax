# AI SDK Adapters

PatchPilot supports three agent paths:

- Codex CLI: real workspace-editing remediation.
- OpenAI SDK: plan-only remediation through the official OpenAI SDK Responses API.
- Vercel AI SDK / AI Gateway: plan-only remediation through provider/model strings such as `openai/gpt-5`.
- Deterministic npm fixer: real direct dependency update when OSV provides a fixed npm version.

Environment:

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
AI_GATEWAY_API_KEY=
AI_GATEWAY_MODEL=openai/gpt-5
VERCEL_OIDC_TOKEN=
```

Plan-only adapters do not claim files were edited. They are intended for users who have API or AI Gateway access but do not have Codex CLI available.
