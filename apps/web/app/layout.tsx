import "./globals.css";
import type { ReactNode } from "react";
import { Activity, Bell, FileClock, Gauge, GitPullRequest, Radar, ReceiptText, Settings, Shield, SquareStack } from "lucide-react";

const nav = [
  ["/", "Watch Commander", Gauge],
  ["/threat-radar", "Threat Radar", Radar],
  ["/blast-radius", "Blast Radius", SquareStack],
  ["/projects", "Projects", Shield],
  ["/findings", "Findings", Activity],
  ["/remediations", "Remediation Jobs", GitPullRequest],
  ["/approvals", "Approvals", Bell],
  ["/audit", "Audit Receipts", ReceiptText],
  ["/settings", "Settings", Settings]
] as const;

export const metadata = {
  title: "PatchPilot Watch Commander",
  description: "Open-source CVE and supply-chain response command center."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="side">
            <div className="brand">PatchPilot Watch Commander</div>
            <nav className="nav">
              {nav.map(([href, label, Icon]) => (
                <a key={href} href={href}>
                  <Icon size={16} />
                  {label}
                </a>
              ))}
            </nav>
            <div style={{ marginTop: 28 }} className="muted">
              <FileClock size={16} /> Real integrations only. Missing credentials show unavailable states.
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
