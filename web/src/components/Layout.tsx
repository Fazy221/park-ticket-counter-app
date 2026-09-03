import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Ticket, AlertTriangle, Users, MonitorCheck, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pb";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/tickets", label: "Tickets", icon: Ticket },
  { to: "/conflicts", label: "Conflicts", icon: AlertTriangle },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/counters", label: "Counters", icon: MonitorCheck },
];

export function Layout() {
  const { staff, logout } = useAuth();
  const [live, setLive] = useState(pb.realtime.isConnected);

  // Polls isConnected rather than relying on a single onDisconnect
  // callback, since we also want to notice reconnection (isConnected
  // flipping back to true), which BaseService doesn't expose an event
  // for on its own. Checks once immediately (not just every 2s) since the
  // realtime connection is often already established by the time this
  // mounts - without this the badge shows "Reconnecting…" for up to 2s on
  // every page load even though the connection is fine.
  useEffect(() => {
    setLive(pb.realtime.isConnected);
    const id = setInterval(() => setLive(pb.realtime.isConnected), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gatemark-primary text-sm font-bold text-white">
            G
          </div>
          <span className="text-sm font-semibold text-slate-900">GateMark</span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gatemark-primary/10 text-gatemark-primary"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 px-3 text-xs text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${live ? "bg-gatemark-success" : "bg-slate-300"}`}
            />
            {live ? "Live" : "Reconnecting…"}
          </div>
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{staff?.name}</p>
              <p className="text-xs text-slate-400">Superadmin</p>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
