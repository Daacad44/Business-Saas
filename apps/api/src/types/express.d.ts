import type { PermissionKey } from "@daljir/types";
import type { Membership, Role, User } from "@prisma/client";

export type AuthContext = {
  userId: string;
  sessionId: string;
  user: User;
};

export type TenantContext = {
  businessId: string;
  membership: Membership & { role: Role };
  permissions: PermissionKey[];
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      tenant?: TenantContext;
    }
  }
}

export {};
