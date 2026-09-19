import type { PermissionKey, RoleSlug } from "@daljir/types";

export const PERMISSION_CATALOG: Array<{
  key: PermissionKey;
  family: string;
  description: string;
}> = [
  { key: "sales.create", family: "sales", description: "Create sales and POS transactions" },
  { key: "sales.read", family: "sales", description: "View sales" },
  { key: "sales.update", family: "sales", description: "Update sales" },
  { key: "sales.delete", family: "sales", description: "Void or delete sales" },
  { key: "inventory.create", family: "inventory", description: "Create products and stock records" },
  { key: "inventory.read", family: "inventory", description: "View inventory" },
  { key: "inventory.adjust", family: "inventory", description: "Adjust stock quantities" },
  { key: "inventory.transfer", family: "inventory", description: "Transfer stock between warehouses" },
  { key: "customers.create", family: "customers", description: "Create customers" },
  { key: "customers.read", family: "customers", description: "View customers" },
  { key: "customers.update", family: "customers", description: "Update customers" },
  { key: "debts.read", family: "debts", description: "View customer debts" },
  { key: "debts.collect", family: "debts", description: "Collect and allocate debt payments" },
  { key: "debts.remind", family: "debts", description: "Send debt reminders" },
  { key: "purchases.create", family: "purchases", description: "Create purchases" },
  { key: "purchases.read", family: "purchases", description: "View purchases" },
  { key: "reports.read", family: "reports", description: "View reports" },
  { key: "expenses.create", family: "expenses", description: "Create expenses" },
  { key: "expenses.read", family: "expenses", description: "View expenses" },
  { key: "users.invite", family: "users", description: "Invite users" },
  { key: "users.manage", family: "users", description: "Manage users and roles" },
  { key: "settings.manage", family: "settings", description: "Manage business settings" },
  { key: "automation.manage", family: "automation", description: "Manage automation rules" },
];

const ALL_KEYS = PERMISSION_CATALOG.map((item) => item.key);

export const SYSTEM_ROLE_TEMPLATES: Array<{
  slug: RoleSlug;
  name: string;
  description: string;
  permissions: PermissionKey[];
}> = [
  {
    slug: "owner",
    name: "Owner",
    description: "Full control of the business",
    permissions: ALL_KEYS,
  },
  {
    slug: "admin",
    name: "Admin",
    description: "Administer users, settings, and operations",
    permissions: ALL_KEYS,
  },
  {
    slug: "manager",
    name: "Manager",
    description: "Run daily sales, inventory, and reporting",
    permissions: [
      "sales.create",
      "sales.read",
      "sales.update",
      "inventory.create",
      "inventory.read",
      "inventory.adjust",
      "inventory.transfer",
      "customers.create",
      "customers.read",
      "customers.update",
      "debts.read",
      "debts.collect",
      "purchases.create",
      "purchases.read",
      "reports.read",
      "expenses.create",
      "expenses.read",
      "users.invite",
    ],
  },
  {
    slug: "accountant",
    name: "Accountant",
    description: "Financial records, debts, and reports",
    permissions: [
      "sales.read",
      "customers.read",
      "debts.read",
      "debts.collect",
      "purchases.read",
      "reports.read",
      "expenses.create",
      "expenses.read",
    ],
  },
  {
    slug: "cashier",
    name: "Cashier",
    description: "Point of sale and basic customer lookup",
    permissions: ["sales.create", "sales.read", "customers.read", "customers.create"],
  },
  {
    slug: "sales_staff",
    name: "Sales Staff",
    description: "Create sales and manage customers",
    permissions: [
      "sales.create",
      "sales.read",
      "customers.create",
      "customers.read",
      "customers.update",
      "debts.read",
    ],
  },
  {
    slug: "inventory_manager",
    name: "Inventory Manager",
    description: "Products, stock, adjustments, and transfers",
    permissions: [
      "inventory.create",
      "inventory.read",
      "inventory.adjust",
      "inventory.transfer",
      "purchases.create",
      "purchases.read",
    ],
  },
  {
    slug: "warehouse_staff",
    name: "Warehouse Staff",
    description: "View stock and receive transfers",
    permissions: ["inventory.read", "inventory.transfer"],
  },
  {
    slug: "viewer",
    name: "Viewer",
    description: "Read-only access",
    permissions: [
      "sales.read",
      "inventory.read",
      "customers.read",
      "debts.read",
      "purchases.read",
      "reports.read",
      "expenses.read",
    ],
  },
];

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
