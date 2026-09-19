import { z } from "zod";

export const businessTypeSchema = z.enum([
  "RETAIL",
  "WHOLESALE",
  "SUPERMARKET",
  "PHARMACY",
  "ELECTRONICS",
  "CLOTHING",
  "HARDWARE",
  "MOBILE",
  "AUTO_PARTS",
  "GENERAL_TRADING",
  "OTHER",
]);

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(10).max(128),
  phone: z.string().trim().min(7).max(32).optional(),
  invitationToken: z.string().min(16).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: businessTypeSchema,
  phone: z.string().trim().min(7).max(32).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  currency: z.string().trim().length(3).default("USD"),
  timezone: z.string().trim().min(3).max(64).default("Africa/Mogadishu"),
  locale: z.enum(["en", "so"]).default("en"),
  branch: z.object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(1).max(32),
    address: z.string().trim().max(240).optional(),
    phone: z.string().trim().min(7).max(32).optional(),
  }),
  warehouse: z.object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(1).max(32),
  }),
});

export const updateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  type: businessTypeSchema.optional(),
  phone: z.string().trim().min(7).max(32).nullable().optional(),
  email: z.string().trim().email().toLowerCase().nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  locale: z.enum(["en", "so"]).optional(),
});

export const updateBusinessSettingsSchema = z.object({
  lowStockAlerts: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  roleId: z.string().min(1),
});

export const updateMembershipSchema = z.object({
  roleId: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  permissionKeys: z.array(z.string().min(1)).min(1),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(240).nullable().optional(),
  permissionKeys: z.array(z.string().min(1)).min(1).optional(),
});

export const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(32),
  address: z.string().trim().max(240).optional(),
  phone: z.string().trim().min(7).max(32).optional(),
  isDefault: z.boolean().optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().min(1).max(32).optional(),
  address: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().min(7).max(32).nullable().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const createWarehouseSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(32),
  isDefault: z.boolean().optional(),
});

export const updateWarehouseSchema = z.object({
  branchId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().min(1).max(32).optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(16),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
