import type { SessionPayload } from "@daljir/types";
import { api } from "./api";

export function getSession() {
  return api<SessionPayload>("/auth/me");
}

export function login(email: string, password: string) {
  return api<SessionPayload>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(input: {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  invitationToken?: string;
}) {
  return api<SessionPayload>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return api<{ ok: true }>("/auth/logout", { method: "POST" });
}
