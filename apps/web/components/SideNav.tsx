"use client";

import { usePathname } from "next/navigation";
import { Activity, Bell, Gauge, GitPullRequest, Radar, ReceiptText, Settings, Shield, SquareStack } from "lucide-react";

const NAV = [
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

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {NAV.map(([href, label, Icon]) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <a key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <Icon size={16} />
            {label}
          </a>
        );
      })}
    </nav>
  );
}
