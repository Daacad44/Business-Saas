export type ApiSuccess<T> = {
  data: T;
  error: null;
  meta?: Record<string, unknown>;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiFailure = {
  data: null;
  error: ApiErrorBody;
  meta?: Record<string, unknown>;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type BusinessType =
  | "RETAIL"
  | "WHOLESALE"
  | "SUPERMARKET"
  | "PHARMACY"
  | "ELECTRONICS"
  | "CLOTHING"
  | "HARDWARE"
  | "MOBILE"
  | "AUTO_PARTS"
  | "GENERAL_TRADING"
  | "OTHER";

export type PermissionKey =
  | "sales.create"
  | "sales.read"
  | "sales.update"
  | "sales.delete"
  | "inventory.create"
  | "inventory.read"
  | "inventory.adjust"
  | "inventory.transfer"
  | "customers.create"
  | "customers.read"
  | "customers.update"
  | "debts.read"
  | "debts.collect"
  | "debts.remind"
  | "purchases.create"
  | "purchases.read"
  | "reports.read"
  | "expenses.create"
  | "expenses.read"
  | "users.invite"
  | "users.manage"
  | "settings.manage"
  | "automation.manage";

export type RoleSlug =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "cashier"
  | "sales_staff"
  | "inventory_manager"
  | "warehouse_staff"
  | "viewer";

export type PlatformRole = "USER" | "SUPER_ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: "ACTIVE" | "DISABLED" | "PENDING";
  platformRole: PlatformRole;
};

export type MembershipSummary = {
  id: string;
  businessId: string;
  businessName: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  permissions: PermissionKey[];
};

export type SessionPayload = {
  user: AuthUser;
  memberships: MembershipSummary[];
  currentMembership: MembershipSummary | null;
};
