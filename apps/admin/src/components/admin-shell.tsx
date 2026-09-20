"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  Users,
  Activity,
  FileText,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/businesses", label: "Businesses", icon: Building2 },
  { href: "/users", label: "Users", icon: Users },
  { href: "/system", label: "System Health", icon: Activity },
  { href: "/audit-logs", label: "Audit Logs", icon: FileText },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useQuery({ queryKey: ["session"], queryFn: getSession });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  };

  return (
    <div className="flex min-h-screen bg-sand">
      {/* Sidebar */}
      <aside className="w-64 border-r border-line bg-paper/90 backdrop-blur p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 pb-6 border-b border-line">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal text-paper">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display font-semibold text-teal leading-tight">Daljir</p>
              <p className="text-xs uppercase tracking-wider text-copper font-medium">Platform Admin</p>
            </div>
          </div>

          <nav className="mt-6 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-teal text-paper shadow-sm"
                      : "text-muted hover:bg-sand/60 hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 border-t border-line space-y-3">
          <div className="px-2">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="text-sm font-semibold text-ink truncate">
              {session.data?.user.email ?? "Admin"}
            </p>
            <span className="mt-1 inline-block rounded-full bg-copper/15 px-2 py-0.5 text-[10px] font-semibold text-copper">
              SUPER_ADMIN
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-line bg-paper/60 backdrop-blur px-8 flex items-center justify-between">
          <p className="text-sm font-medium text-muted">
            Global SaaS Management Console
          </p>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-muted">System Online</span>
          </div>
        </header>

        <main className="p-8 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
