"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Shield, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/form";
import { api } from "@/lib/api";

type UserItem = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  platformRole: "USER" | "SUPER_ADMIN";
  createdAt: string;
  lastLoginAt: string | null;
  membershipCount: number;
};

export default function AdminUsersPage() {
  const { data, isLoading, isError } = useQuery<UserItem[]>({
    queryKey: ["admin-users"],
    queryFn: () => api<UserItem[]>("/admin/users"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] font-semibold text-copper">
            Identity & Access
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Platform Users
          </h1>
          <p className="mt-1 text-sm text-muted">
            All user accounts across all businesses and platform administrative scopes.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-muted">
          <Users className="h-4 w-4 text-copper" />
          <span>Total: {data?.length ?? 0}</span>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-sand/40 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Platform Role</th>
                <th className="px-6 py-4 font-semibold">Businesses</th>
                <th className="px-6 py-4 font-semibold">Last Login</th>
                <th className="px-6 py-4 font-semibold">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted">
                    Loading users...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-red-700">
                    Failed to fetch users.
                  </td>
                </tr>
              ) : !data || data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted">
                    No users found.
                  </td>
                </tr>
              ) : (
                data.map((u) => (
                  <tr key={u.id} className="hover:bg-sand/20 transition">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-ink">{u.fullName}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {u.platformRole === "SUPER_ADMIN" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-copper/15 px-2.5 py-1 text-xs font-semibold text-copper">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          SUPER_ADMIN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sand px-2.5 py-1 text-xs text-muted">
                          <Shield className="h-3.5 w-3.5" />
                          USER
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-semibold text-ink">
                      {u.membershipCount}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted">
                      {new Date(u.createdAt).toLocaleDateString()}
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
