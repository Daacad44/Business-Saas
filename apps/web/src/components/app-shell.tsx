"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getSession, logout } from "@/lib/auth";
import { LanguageSwitcher } from "./language-switcher";
import { Button } from "./ui/button";

const links = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/inventory/products", key: "products" },
  { href: "/inventory/categories", key: "categories" },
  { href: "/inventory/units", key: "units" },
  { href: "/inventory/stock-levels", key: "stockLevels" },
  { href: "/inventory/stock-movements", key: "stockMovements" },
  { href: "/inventory/stock-adjustments", key: "stockAdjustments" },
  { href: "/inventory/stock-transfers", key: "stockTransfers" },
  { href: "/customers", key: "customers" },
  { href: "/debts", key: "debts" },
  { href: "/settings", key: "settings" },
  { href: "/settings/team", key: "team" },
  { href: "/settings/roles", key: "roles" },
  { href: "/settings/locations", key: "locations" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const meta = useTranslations("meta");
  const pathname = usePathname();
  const router = useRouter();
  const session = useQuery({ queryKey: ["session"], queryFn: getSession });

  async function onLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-line bg-teal text-paper lg:border-b-0 lg:border-r lg:border-teal-dark">
        <div className="flex items-center justify-between px-5 py-5 lg:block">
          <div>
            <p className="font-display text-xl">{meta("company")}</p>
            <p className="mt-1 text-xs text-paper/70">
              {session.data?.currentMembership?.businessName ?? meta("product")}
            </p>
          </div>
          <div className="lg:hidden">
            <LanguageSwitcher />
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:flex-col lg:overflow-visible">
          {links.map((link) => {
            const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${
                  active ? "bg-paper text-teal" : "text-paper/80 hover:bg-teal-dark"
                }`}
              >
                {t(link.key)}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-5 py-4 lg:block">
          <LanguageSwitcher />
          <Button variant="secondary" className="mt-4 w-full" onClick={onLogout}>
            {t("logout")}
          </Button>
        </div>
      </aside>
      <div>
        <header className="flex items-center justify-end gap-3 border-b border-line px-4 py-3 lg:hidden">
          <Button variant="secondary" size="sm" onClick={onLogout}>
            {t("logout")}
          </Button>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
