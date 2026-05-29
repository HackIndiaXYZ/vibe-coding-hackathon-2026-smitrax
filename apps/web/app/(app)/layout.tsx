import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { SideNav } from "../../components/SideNav";
import { DemoBanner } from "../../components/DemoBanner";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href="/">PatchPilot</a>
        <SideNav />
        <div className="sidebar-foot">
          <ShieldCheck size={15} />
          <span>Real integrations only. Missing credentials show unavailable — never faked.</span>
        </div>
      </aside>
      <main className="main">
        <DemoBanner />
        {children}
      </main>
    </div>
  );
}
