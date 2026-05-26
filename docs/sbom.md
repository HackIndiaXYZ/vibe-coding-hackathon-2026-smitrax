# SBOM

SBOM generation is tool-gated and uses Syft when available.

Required:

```bash
syft --version
```

Environment:

```text
SYFT_BIN=syft
```

If Syft is missing, PatchPilot returns `sbom_tool_missing`. It does not fabricate SBOMs.
