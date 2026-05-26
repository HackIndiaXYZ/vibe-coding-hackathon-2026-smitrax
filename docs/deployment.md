# Deployment

Local development:

```bash
pnpm install
pnpm dev
pnpm worker:dev
```

Production notes:

- The Next.js web app can run on Vercel or a Node host.
- Long-running Codex remediation should run in a separate worker host.
- Use Postgres/Supabase adapter before multi-user production.
- Use Redis/BullMQ for durable background jobs.
- Use GitHub App installation tokens rather than broad PATs.
- Do not enable auto-merge or production deploy without explicit policy and second approval.
