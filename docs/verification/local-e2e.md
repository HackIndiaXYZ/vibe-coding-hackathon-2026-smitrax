# Local E2E Verification

Generated: 2026-05-27T05:58:34.162Z

## Flow

local fixture project -> scan -> OSV finding -> risk score -> deterministic remediation -> validation -> patch artifact -> audit receipt -> rollback state

## Result

- Project: proj_fVhFZpe8-5 (patchpilot-local-e2e-fixture)
- Scan: scan_muPEJwIfFh, status completed, scanner osv-api
- Finding: find_-luic6r6Gx, lodash 4.17.20 -> 4.17.21
- Risk: 33/100 medium
- Scan confidence: direct_manifest_only
- Remediation: rem_OZbHFJq1rH, status pr_ready, confidence 65
- Changed files: package.json, .gitignore, package-lock.json
- Patch artifact: C:\Users\MOHITH~1\AppData\Local\Temp\patchpilot-local-e2e-1779861505991\logs\patches\rem_OZbHFJq1rH.patch
- Saved patch copy: docs/verification/local-e2e.patch
- Patch includes package.json: true
- Patch includes package-lock.json: true
- Validation: npm ci --ignore-scripts=passed, npm test=passed, npm run build=passed
- Audit receipts for scan/remediation: 2
- Rollback state: not_available because the local patch artifact has not been applied.

## Workspace Handling

- Disposable root: C:\Users\MOHITH~1\AppData\Local\Temp\patchpilot-local-e2e-1779861505991
- Remediation workspace cleanup expected: true
- Workspace directory exists only for retained/debug runs: C:\Users\MOHITH~1\AppData\Local\Temp\patchpilot-local-e2e-1779861505991\workspaces

## Notes

This verification uses the real OSV path configured for PatchPilot. It does not create a GitHub PR, send Telegram, or run Codex.
