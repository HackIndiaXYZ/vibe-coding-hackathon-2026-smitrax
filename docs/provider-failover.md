# Provider Failover

PatchPilot uses an ordered provider ladder:

```text
codex, openrouter, anthropic, grok, openai-compatible, ollama, deterministic
```

Defaults are conservative:

- Cloud-to-cloud failover may proceed when configured.
- Lower-trust providers such as local Ollama or deterministic fallback require consent in `ask` mode.
- Unconfigured providers are skipped without network calls.
- The deterministic fixer is the final fallback and mutates only supported dependency manifests.

Verification:

```bash
pnpm verify:provider-chain
pnpm verify:provider-failover-consent
pnpm demo:provider-failover
```

Provider readiness and the failover timeline are also exposed through MCP:

- `patchpilot.get_provider_readiness`
- `patchpilot.get_provider_failover_timeline`
- `patchpilot.request_provider_failover`

No provider switch is treated as successful unless the selected provider or fallback actually produces a valid PatchPilot remediation result.
