import { z } from "zod";

const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 10_000;
const MAX_DATE_RANGE_DAYS = 366;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export const businessStatusFilterSchema = z.enum(["ALL", "ACTIVE", "SUSPENDED"]).default("ALL");

export const businessListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(160).optional(),
  status: businessStatusFilterSchema,
  sortBy: z.enum(["name", "createdAt", "memberCount"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const suspendBusinessBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const userStatusFilterSchema = z.enum(["ALL", "ACTIVE", "DISABLED", "PENDING"]).default("ALL");
export const platformRoleFilterSchema = z.enum(["ALL", "USER", "SUPER_ADMIN"]).default("ALL");

export const userListQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(160).optional(),
  status: userStatusFilterSchema,
  platformRole: platformRoleFilterSchema,
  sortBy: z.enum(["fullName", "createdAt", "lastLoginAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const updatePlatformRoleBodySchema = z.object({
  platformRole: z.enum(["USER", "SUPER_ADMIN"]),
});

export const overviewQuerySchema = z.object({
  signupDays: z.coerce.number().int().min(1).max(90).default(30),
});

const isoDate = z.coerce.date();

export const auditLogQuerySchema = paginationSchema
  .extend({
    businessId: z.string().trim().min(1).max(64).optional(),
    userId: z.string().trim().min(1).max(64).optional(),
    action: z.string().trim().min(1).max(120).optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
    message: "dateFrom must be before or equal to dateTo",
    path: ["dateFrom"],
  })
  .refine(
    (data) => {
      if (!data.dateFrom || !data.dateTo) return true;
      const rangeMs = data.dateTo.getTime() - data.dateFrom.getTime();
      return rangeMs <= MAX_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000;
    },
    {
      message: `Date range must not exceed ${MAX_DATE_RANGE_DAYS} days`,
      path: ["dateTo"],
    },
  );

export const sessionListQuerySchema = paginationSchema.extend({
  userId: z.string().trim().min(1).max(64).optional(),
  activeOnly: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export const businessIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export const userIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export const sessionIdParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
});
