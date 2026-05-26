# 06 - Data Model and API Spec

## Database choice

Use PostgreSQL with Prisma.

## Core entities

### User

MVP can be single-user. Still keep user ownership fields for future multi-user support.

Fields:

- `id`
- `email`
- `displayName`
- `createdAt`
- `updatedAt`

### Project

Represents a watched project.

Fields:

- `id`
- `userId`
- `name`
- `sourceType`: `github`, `local`
- `githubOwner`
- `githubRepo`
- `githubDefaultBranch`
- `repoUrl`
- `localPath`
- `isPathAllowlisted`
- `packageManager`: `npm`, `pnpm`, `yarn`, `unknown`
- `deploymentProvider`: `vercel`, `unknown`, `none`
- `deploymentUrl`
- `productionExposed`: boolean
- `lastScanAt`
- `lastScanStatus`
- `createdAt`
- `updatedAt`

### ScanJob

Fields:

- `id`
- `projectId`
- `status`
- `startedAt`
- `finishedAt`
- `scanner`: `osv-scanner`, `osv-api`
- `errorCode`
- `errorMessage`
- `rawOutputPath`
- `createdAt`

### Vulnerability

Normalized vulnerability record.

Fields:

- `id`
- `source`: `osv`, `nvd`, `ghsa`
- `osvId`
- `cveId`
- `ghsaId`
- `summary`
- `details`
- `severity`
- `cvssScore`
- `publishedAt`
- `modifiedAt`
- `referencesJson`

### Finding

A vulnerability instance in a project.

Fields:

- `id`
- `projectId`
- `scanJobId`
- `vulnerabilityId`
- `packageName`
- `ecosystem`
- `currentVersion`
- `fixedVersion`
- `dependencyType`: `direct`, `transitive`, `unknown`
- `manifestPath`
- `lockfilePath`
- `riskScore`
- `riskLevel`: `low`, `medium`, `high`, `critical`
- `fixStrategy`: `safe_patch`, `minor_upgrade`, `major_upgrade`, `mitigation`, `manual_review`, `no_fix`
- `status`
- `createdAt`
- `updatedAt`

### RiskSignal

Risk enrichment details.

Fields:

- `id`
- `findingId`
- `epssProbability`
- `epssPercentile`
- `isInKev`
- `kevDueDate`
- `kevKnownRansomwareUse`
- `isProductionExposed`
- `isDirectDependency`
- `hasFix`
- `hasInstallScripts`
- `isNewPackageVersion`
- `notesJson`

### RemediationJob

Fields:

- `id`
- `findingId`
- `projectId`
- `status`
- `agent`: `codex`
- `workspacePath`
- `branchName`
- `baseBranch`
- `startedAt`
- `finishedAt`
- `errorCode`
- `errorMessage`
- `fixConfidence`
- `summary`
- `createdAt`

### JobEvent

Fields:

- `id`
- `jobType`: `scan`, `remediation`
- `jobId`
- `type`
- `level`
- `message`
- `dataJson`
- `createdAt`

### ValidationRun

Fields:

- `id`
- `remediationJobId`
- `command`
- `status`: `passed`, `failed`, `skipped_no_script`
- `exitCode`
- `durationMs`
- `logPath`
- `createdAt`

### PullRequest

Fields:

- `id`
- `remediationJobId`
- `provider`: `github`
- `owner`
- `repo`
- `number`
- `url`
- `branchName`
- `baseBranch`
- `draft`
- `status`: `created`, `failed`, `closed`, `merged`
- `createdAt`

### ApprovalRequest

Fields:

- `id`
- `remediationJobId`
- `channel`: `telegram`, `openclaw`
- `chatIdHash`
- `messageId`
- `status`
- `expiresAt`
- `createdAt`
- `updatedAt`

### AuditReceipt

Fields:

- `id`
- `actorType`: `user`, `system`, `agent`
- `actorId`
- `channel`
- `action`
- `targetType`
- `targetId`
- `beforeJson`
- `afterJson`
- `redacted`: boolean
- `createdAt`

## Prisma sketch

```prisma
model Project {
  id                  String   @id @default(cuid())
  userId              String
  name                String
  sourceType          String
  githubOwner         String?
  githubRepo          String?
  githubDefaultBranch String?
  repoUrl             String?
  localPath           String?
  isPathAllowlisted   Boolean  @default(false)
  packageManager      String   @default("unknown")
  deploymentProvider  String   @default("none")
  deploymentUrl       String?
  productionExposed   Boolean  @default(false)
  lastScanAt          DateTime?
  lastScanStatus      String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  scanJobs            ScanJob[]
  findings            Finding[]
}
```

The coding agent should expand this into complete Prisma schema with relations.

## REST API

### Health

`GET /api/health`

Response:

```json
{
  "ok": true,
  "version": "0.1.0",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Create project

`POST /api/projects`

Request for GitHub:

```json
{
  "sourceType": "github",
  "name": "chat-app",
  "githubOwner": "example",
  "githubRepo": "chat-app"
}
```

Request for local:

```json
{
  "sourceType": "local",
  "name": "local-chat-app",
  "localPath": "C:/Users/Mohith S/Desktop/chat-app"
}
```

Response:

```json
{
  "id": "proj_123",
  "name": "chat-app",
  "sourceType": "github",
  "lastScanStatus": null
}
```

Validation:

- GitHub project must validate API access.
- Local project must pass allowlist and path safety checks.

### List projects

`GET /api/projects`

Response:

```json
{
  "projects": [
    {
      "id": "proj_123",
      "name": "chat-app",
      "sourceType": "github",
      "lastScanStatus": "completed",
      "openFindings": 2,
      "criticalFindings": 1
    }
  ]
}
```

### Start scan

`POST /api/projects/{projectId}/scan`

Response:

```json
{
  "scanJobId": "scan_123",
  "status": "queued"
}
```

### Scan all

`POST /api/scans/run-all`

Response:

```json
{
  "queued": 7,
  "scanJobIds": ["scan_1", "scan_2"]
}
```

### Get findings

`GET /api/findings?status=open`

Response:

```json
{
  "findings": [
    {
      "id": "find_123",
      "projectName": "chat-app",
      "packageName": "lodash",
      "currentVersion": "4.17.20",
      "fixedVersion": "4.17.21",
      "riskScore": 78,
      "riskLevel": "high",
      "status": "fix_available"
    }
  ]
}
```

### Start remediation

`POST /api/findings/{findingId}/remediate`

Request:

```json
{
  "agent": "codex",
  "mode": "draft_pr"
}
```

Response:

```json
{
  "remediationJobId": "rem_123",
  "status": "queued"
}
```

### Get remediation job

`GET /api/remediations/{id}`

Response includes:

- status.
- timeline events.
- validation runs.
- PR link.
- approval status.

### Telegram webhook

`POST /api/integrations/telegram/webhook`

Requirements:

- Validate Telegram update shape.
- Validate callback signature stored in callback data.
- Only allowed chat IDs can approve.

### Audit receipts

`GET /api/audit/{receiptId}`

Response:

```json
{
  "id": "rec_123",
  "action": "approval.approved",
  "actorType": "user",
  "channel": "telegram",
  "targetType": "remediation_job",
  "targetId": "rem_123",
  "createdAt": "2026-05-26T12:00:00.000Z"
}
```

## Error format

All API errors must use:

```json
{
  "error": {
    "code": "github_unauthorized",
    "message": "GitHub token is missing or does not have access to this repository.",
    "details": {}
  }
}
```
