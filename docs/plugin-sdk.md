# Plugin SDK

PatchPilot validates plugin manifests before loading.

Manifest:

```json
{
  "id": "patchpilot-plugin-example",
  "version": "0.1.0",
  "entry": "./dist/index.js",
  "permissions": ["project:read", "scanner:emit-findings"]
}
```

Implemented:

- manifest schema validation
- permission warning for dangerous permissions such as `secrets:read` and `process:exec`

Planned:

- signed plugin registry
- sandboxed loading
- scanner, notifier, deployment, and agent plugin runtime interfaces
