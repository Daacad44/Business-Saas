"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

type Role = { id: string; name: string; slug: string };
type Member = {
  id: string;
  status: string;
  user: { fullName: string; email: string };
  role: { name: string; slug: string };
};

export default function TeamPage() {
  const t = useTranslations("team");
  const queryClient = useQueryClient();
  const [inviteUrl, setInviteUrl] = useState<string>();
  const [error, setError] = useState<string>();

  const members = useQuery({ queryKey: ["users"], queryFn: () => api<Member[]>("/users") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });

  const invite = useMutation({
    mutationFn: (body: { email: string; roleId: string }) =>
      api<{ token: string }>("/users/invite", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async (data) => {
      setInviteUrl(`${window.location.origin}/register?invite=${data.token}`);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Invite failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <Card className="mt-6 max-w-xl">
        <h2 className="font-display text-2xl">{t("invite")}</h2>
        <form
          className="mt-4 space-y-3"
          action={(formData) => {
            setError(undefined);
            invite.mutate({
              email: String(formData.get("email")),
              roleId: String(formData.get("roleId")),
            });
          }}
        >
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="roleId">{t("role")}</Label>
            <Select id="roleId" name="roleId" required>
              {(roles.data ?? [])
                .filter((role) => role.slug !== "owner")
                .map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
            </Select>
          </div>
          <FieldError message={error} />
          <Button type="submit" disabled={invite.isPending}>
            {t("send")}
          </Button>
        </form>
        {inviteUrl ? (
          <div className="mt-4 rounded-2xl bg-sand p-4 text-sm">
            <p>{t("tokenHint")}</p>
            <p className="mt-2 break-all font-mono text-xs">{inviteUrl}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => navigator.clipboard.writeText(inviteUrl)}
            >
              {t("copy")}
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="mt-8 overflow-x-auto rounded-3xl border border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">{t("email")}</th>
              <th className="px-4 py-3">{t("role")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((member) => (
              <tr key={member.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{member.user.fullName}</td>
                <td className="px-4 py-3">{member.user.email}</td>
                <td className="px-4 py-3">{member.role.name}</td>
                <td className="px-4 py-3">{member.status}</td>
                <td className="px-4 py-3 text-right">
                  {member.role.slug !== "owner" ? (
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(member.id)}>
                      {t("remove")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.data?.length === 0 ? <p className="p-4 text-muted">{t("empty")}</p> : null}
      </div>
    </div>
  );
}
