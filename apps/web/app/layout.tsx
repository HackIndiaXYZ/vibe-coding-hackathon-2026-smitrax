import "./globals.css";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { SideNav } from "../components/SideNav";

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
            <SideNav />
            <div className="sidebar-foot">
              <ShieldCheck size={15} />
              <span>Real integrations only. Missing credentials show unavailable — never faked.</span>
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
