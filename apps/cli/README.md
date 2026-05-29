# @patchpilot/cli

A thin, standalone supply-chain scanner over `@patchpilot/core`. Scans a project
folder (npm + PyPI) against the real OSV database and tags each finding with the
**reachability (VEX-lite)** signal — so you fix what's actually imported first.

## Usage

```bash
# From a published package (after publish — see below)
npx @patchpilot/cli scan ./my-app
npx @patchpilot/cli scan . --fail-on high
npx @patchpilot/cli scan . --json > findings.json

# From this monorepo (works today, no publish needed)
pnpm scan:cli /absolute/path/to/project
```

Options:

- `--json` — machine-readable output.
- `--fail-on <critical|high|medium|low>` — exit non-zero when a finding at or
  above that severity exists (for CI gating). Default: never fails.
- `NO_COLOR=1` — disable ANSI colors.

It queries the live OSV API / OSV-Scanner. No network → no findings. PatchPilot
never fabricates results.

## Reachability tag

| Tag | Meaning |
|---|---|
| `reachable` | The vulnerable package is imported in your first-party source — fix first. |
| `likely unused` | A direct npm dep that is never imported — de-prioritized (VEX-lite). |
| `transitive` | Pulled in by a parent dependency, not a first-party import. |
| `unknown` | Couldn't determine (e.g. PyPI install-name ≠ import-name). |

## Building a self-contained binary (for publishing)

The published `bin` is a single bundled file at `dist/index.js` (core is bundled
in, so the package has no runtime workspace dependency):

```bash
pnpm cli:bundle           # → apps/cli/dist/index.js (esbuild, ESM, node18+)
node apps/cli/dist/index.js scan ./my-app   # verify
```

## Publishing (do this only when ready)

```bash
pnpm cli:bundle
cd apps/cli
npm publish --access public      # requires npm login + the @patchpilot scope
```

Until then, use `pnpm scan:cli` from the repo.
