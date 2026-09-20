"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@daljir/validation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label } from "@/components/ui/form";
import { login } from "@/lib/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      const payload = await login(values.email, values.password);
      if (payload.user.platformRole !== "SUPER_ADMIN") {
        await fetch("/api/v1/auth/logout", { method: "POST" });
        setServerError("Access denied: Your account does not have Super Admin privileges.");
        return;
      }
      router.replace("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid credentials";
      setServerError(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[radial-gradient(circle_at_top_left,_#f7d9c4,_transparent_28%),radial-gradient(circle_at_80%_0%,_#cfe4df,_transparent_32%),#f4ede4]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal text-paper shadow-md">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold text-ink">Daljir Admin</h1>
          <p className="mt-1 text-sm text-muted">Platform Super Administrator Console</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {serverError}
              </div>
            )}

            <div>
              <Label htmlFor="email">Admin Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@daljir.com"
                autoComplete="email"
                {...register("email")}
              />
              <FieldError message={errors.email?.message} />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                autoComplete="current-password"
                {...register("password")}
              />
              <FieldError message={errors.password?.message} />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full mt-2">
              {isSubmitting ? "Authenticating..." : "Sign in to Admin Console"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
