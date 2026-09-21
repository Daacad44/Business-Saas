import { PlatformRole, UserStatus } from "@prisma/client";
import { registerSchema } from "@daljir/validation";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";

/** Same email + password rules as public registration. Do not loosen. */
const adminBootstrapCredentialsSchema = registerSchema.pick({
  email: true,
  password: true,
});

export class AdminBootstrapError extends Error {
  override readonly name = "AdminBootstrapError";

  constructor(message: string) {
    super(message);
  }
}

export type AdminBootstrapResult = {
  action: "created" | "updated";
  email: string;
  platformRole: typeof PlatformRole.SUPER_ADMIN;
  status: UserStatus;
};

export type AdminBootstrapEnv = {
  ADMIN_BOOTSTRAP_EMAIL?: string;
  ADMIN_BOOTSTRAP_PASSWORD?: string;
};

function missingCredential(value: string | undefined): boolean {
  return value === undefined || value.length === 0;
}

/**
 * Idempotent one-shot: create or promote a single user to SUPER_ADMIN using
 * Argon2id. Reads credentials only from the provided env (process.env by default).
 * Does not create a business, membership, or any other user.
 */
export async function bootstrapPlatformAdmin(
  env: AdminBootstrapEnv = process.env,
): Promise<AdminBootstrapResult> {
  if (missingCredential(env.ADMIN_BOOTSTRAP_EMAIL) || missingCredential(env.ADMIN_BOOTSTRAP_PASSWORD)) {
    throw new AdminBootstrapError(
      "ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must both be set. Refusing to create a user.",
    );
  }

  const parsed = adminBootstrapCredentialsSchema.safeParse({
    email: env.ADMIN_BOOTSTRAP_EMAIL,
    password: env.ADMIN_BOOTSTRAP_PASSWORD,
  });
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "credentials";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new AdminBootstrapError(
      `Invalid ADMIN_BOOTSTRAP_EMAIL or ADMIN_BOOTSTRAP_PASSWORD (${details}). Refusing to write a user.`,
    );
  }

  const { email, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!existing) {
      const created = await tx.user.create({
        data: {
          email,
          fullName: "Platform Super Admin",
          passwordHash,
          status: UserStatus.ACTIVE,
          platformRole: PlatformRole.SUPER_ADMIN,
        },
        select: {
          email: true,
          platformRole: true,
          status: true,
        },
      });
      return {
        action: "created",
        email: created.email,
        platformRole: PlatformRole.SUPER_ADMIN,
        status: created.status,
      };
    }

    const updated = await tx.user.update({
      where: { email },
      data: {
        platformRole: PlatformRole.SUPER_ADMIN,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
      select: {
        email: true,
        platformRole: true,
        status: true,
      },
    });
    return {
      action: "updated",
      email: updated.email,
      platformRole: PlatformRole.SUPER_ADMIN,
      status: updated.status,
    };
  });
}
