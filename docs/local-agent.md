# Local Agent And Folder Scanning

Local project inventory requires `PATCHPILOT_LOCAL_ROOTS`.

Rules:

- The requested path and allowlist roots are resolved with realpath.
- Root drives such as `C:\` are not accepted as allowlist roots.
- Paths outside the allowlist are rejected.
- The scanner reads package metadata and sends package names/versions to OSV.
- Source code is not uploaded by the OSV fallback scanner.

Validation commands run with a reduced child process environment and redacted logs.
