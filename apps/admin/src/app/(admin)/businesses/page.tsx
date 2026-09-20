"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/form";
import { api } from "@/lib/api";

type BusinessItem = {
  id: string;
  name: string;
  slug: string;
  type: string;
  currency: string;
  timezone: string;
  locale: string;
  createdAt: string;
  memberCount: number;
  branchCount: number;
  warehouseCount: number;
};

export default function AdminBusinessesPage() {
  const { data, isLoading, isError } = useQuery<BusinessItem[]>({
    queryKey: ["admin-businesses"],
    queryFn: () => api<BusinessItem[]>("/admin/businesses"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">
            Tenancy Directory
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Registered Businesses
          </h1>
          <p className="mt-1 text-sm text-muted">
            All active multi-tenant accounts on the Daljir SaaS platform.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-muted">
          <Building2 className="h-4 w-4 text-teal" />
          <span>Total: {data?.length ?? 0}</span>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-sand/40 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-4 font-semibold">Business Name</th>
                <th className="px-6 py-4 font-semibold">Type</th>
                <th className="px-6 py-4 font-semibold">Currency</th>
                <th className="px-6 py-4 font-semibold">Members</th>
                <th className="px-6 py-4 font-semibold">Branches</th>
                <th className="px-6 py-4 font-semibold">Warehouses</th>
                <th className="px-6 py-4 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted">
                    Loading businesses...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-red-700">
                    Failed to fetch businesses.
                  </td>
                </tr>
              ) : !data || data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted">
                    No businesses created yet.
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={item.id} className="hover:bg-sand/20 transition">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink">{item.name}</p>
                      <p className="text-xs text-muted font-mono">{item.slug}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block rounded-full bg-sand px-2.5 py-1 text-xs font-medium text-ink">
                        {item.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{item.currency}</td>
                    <td className="px-6 py-4 font-semibold text-ink">{item.memberCount}</td>
                    <td className="px-6 py-4 font-semibold text-ink">{item.branchCount}</td>
                    <td className="px-6 py-4 font-semibold text-ink">{item.warehouseCount}</td>
                    <td className="px-6 py-4 text-xs text-muted">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
