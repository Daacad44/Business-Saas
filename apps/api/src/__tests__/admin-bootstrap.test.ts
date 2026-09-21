import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PlatformRole, UserStatus } from "@prisma/client";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { AdminBootstrapError, bootstrapPlatformAdmin } from "../modules/admin/bootstrap-admin.js";
import { TEST_PASSWORD, uniqueEmail } from "./admin-test-helpers.js";

const app = createApp();
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");

describe("platform admin bootstrap", () => {
  it("exits the CLI non-zero and writes nothing when either env var is missing", async () => {
    const bystanderEmail = uniqueEmail("bootstrap-missing-bystander");
    await prisma.user.create({
      data: {
        email: bystanderEmail,
        fullName: "Bystander",
        passwordHash: await hashPassword(TEST_PASSWORD),
        status: UserStatus.ACTIVE,
        platformRole: PlatformRole.USER,
      },
    });
    const usersBefore = await prisma.user.count();

    await expect(bootstrapPlatformAdmin({})).rejects.toThrow(AdminBootstrapError);
    await expect(bootstrapPlatformAdmin({ ADMIN_BOOTSTRAP_EMAIL: uniqueEmail("no-password") })).rejects.toThrow(
      /ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must both be set/,
    );
    await expect(bootstrapPlatformAdmin({ ADMIN_BOOTSTRAP_PASSWORD: TEST_PASSWORD })).rejects.toThrow(
      /ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must both be set/,
    );
    await expect(
      bootstrapPlatformAdmin({ ADMIN_BOOTSTRAP_EMAIL: "", ADMIN_BOOTSTRAP_PASSWORD: "" }),
    ).rejects.toThrow(/must both be set/);

    const cli = spawnSync("pnpm", ["admin:bootstrap"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ADMIN_BOOTSTRAP_EMAIL: "",
        ADMIN_BOOTSTRAP_PASSWORD: "",
      },
    });
    expect(cli.status).not.toBe(0);
    const cliOutput = `${cli.stdout}${cli.stderr}`;
    expect(cliOutput).toMatch(/ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must both be set/);
    expect(cliOutput).not.toMatch(/passwordHash/i);

    expect(await prisma.user.count()).toBe(usersBefore);
    const bystander = await prisma.user.findUniqueOrThrow({ where: { email: bystanderEmail } });
    expect(bystander.platformRole).toBe(PlatformRole.USER);
  });

  it("rejects invalid email with the existing Zod rule and does not write a user", async () => {
    const usersBefore = await prisma.user.count();
    await expect(
      bootstrapPlatformAdmin({
        ADMIN_BOOTSTRAP_EMAIL: "not-an-email",
        ADMIN_BOOTSTRAP_PASSWORD: TEST_PASSWORD,
      }),
    ).rejects.toMatchObject({
      name: "AdminBootstrapError",
      message: expect.stringMatching(/email:.*[Ii]nvalid/s),
    });
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it("rejects a too-short password with the existing Zod min(10) rule and does not write a user", async () => {
    const email = uniqueEmail("bootstrap-short-password");
    await expect(
      bootstrapPlatformAdmin({
        ADMIN_BOOTSTRAP_EMAIL: email,
        ADMIN_BOOTSTRAP_PASSWORD: "shortpwd1",
      }),
    ).rejects.toThrow(/password: String must contain at least 10 character\(s\)/);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("creates an ACTIVE SUPER_ADMIN, is idempotent, and never changes a different user's role", async () => {
    const targetEmail = uniqueEmail("bootstrap-target");
    const bystanderEmail = uniqueEmail("bootstrap-bystander");
    await prisma.user.create({
      data: {
        email: bystanderEmail,
        fullName: "Leave Me Alone",
        passwordHash: await hashPassword(TEST_PASSWORD),
        status: UserStatus.ACTIVE,
        platformRole: PlatformRole.USER,
      },
    });

    const first = await bootstrapPlatformAdmin({
      ADMIN_BOOTSTRAP_EMAIL: targetEmail,
      ADMIN_BOOTSTRAP_PASSWORD: TEST_PASSWORD,
    });
    expect(first.action).toBe("created");
    expect(first.email).toBe(targetEmail);
    expect(first.platformRole).toBe(PlatformRole.SUPER_ADMIN);
    expect(first.status).toBe(UserStatus.ACTIVE);
    expect(first).not.toHaveProperty("passwordHash");

    const second = await bootstrapPlatformAdmin({
      ADMIN_BOOTSTRAP_EMAIL: targetEmail,
      ADMIN_BOOTSTRAP_PASSWORD: TEST_PASSWORD,
    });
    expect(second.action).toBe("updated");
    expect(second.email).toBe(targetEmail);
    expect(second.platformRole).toBe(PlatformRole.SUPER_ADMIN);
    expect(second.status).toBe(UserStatus.ACTIVE);

    const matches = await prisma.user.findMany({
      where: { email: targetEmail },
      select: { email: true, platformRole: true, status: true, passwordHash: true },
    });
    expect(matches).toHaveLength(1);
    const [row] = matches;
    expect(row?.platformRole).toBe(PlatformRole.SUPER_ADMIN);
    expect(row?.status).toBe(UserStatus.ACTIVE);
    expect(await verifyPassword(row!.passwordHash, TEST_PASSWORD)).toBe(true);

    const bystander = await prisma.user.findUniqueOrThrow({
      where: { email: bystanderEmail },
      select: { platformRole: true, status: true },
    });
    expect(bystander.platformRole).toBe(PlatformRole.USER);
    expect(bystander.status).toBe(UserStatus.ACTIVE);

    const memberships = await prisma.membership.count({
      where: { user: { email: targetEmail } },
    });
    expect(memberships).toBe(0);
  });

  it("promotes an existing USER to SUPER_ADMIN and replaces the password without touching other users", async () => {
    const targetEmail = uniqueEmail("bootstrap-promote");
    const otherEmail = uniqueEmail("bootstrap-other-super");
    const oldPassword = "OriginalPass-1";
    await prisma.user.create({
      data: {
        email: targetEmail,
        fullName: "Existing Operator",
        passwordHash: await hashPassword(oldPassword),
        status: UserStatus.DISABLED,
        platformRole: PlatformRole.USER,
      },
    });
    const other = await prisma.user.create({
      data: {
        email: otherEmail,
        fullName: "Other Super",
        passwordHash: await hashPassword(TEST_PASSWORD),
        status: UserStatus.ACTIVE,
        platformRole: PlatformRole.SUPER_ADMIN,
      },
    });

    const result = await bootstrapPlatformAdmin({
      ADMIN_BOOTSTRAP_EMAIL: targetEmail,
      ADMIN_BOOTSTRAP_PASSWORD: TEST_PASSWORD,
    });
    expect(result.action).toBe("updated");
    expect(result.platformRole).toBe(PlatformRole.SUPER_ADMIN);
    expect(result.status).toBe(UserStatus.ACTIVE);

    const promoted = await prisma.user.findUniqueOrThrow({
      where: { email: targetEmail },
      select: { platformRole: true, status: true, passwordHash: true, fullName: true },
    });
    expect(promoted.platformRole).toBe(PlatformRole.SUPER_ADMIN);
    expect(promoted.status).toBe(UserStatus.ACTIVE);
    expect(promoted.fullName).toBe("Existing Operator");
    expect(await verifyPassword(promoted.passwordHash, TEST_PASSWORD)).toBe(true);
    expect(await verifyPassword(promoted.passwordHash, oldPassword)).toBe(false);

    const untouched = await prisma.user.findUniqueOrThrow({
      where: { id: other.id },
      select: { platformRole: true, email: true },
    });
    expect(untouched.email).toBe(otherEmail);
    expect(untouched.platformRole).toBe(PlatformRole.SUPER_ADMIN);
  });

  it("lets a bootstrapped SUPER_ADMIN call GET /api/v1/admin/overview while a regular user still cannot", async () => {
    const adminEmail = uniqueEmail("bootstrap-login-admin");
    await bootstrapPlatformAdmin({
      ADMIN_BOOTSTRAP_EMAIL: adminEmail,
      ADMIN_BOOTSTRAP_PASSWORD: TEST_PASSWORD,
    });

    const adminAgent = request.agent(app);
    const login = await adminAgent.post("/api/v1/auth/login").send({
      email: adminEmail,
      password: TEST_PASSWORD,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.user.platformRole).toBe("SUPER_ADMIN");

    const overview = await adminAgent.get("/api/v1/admin/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.error).toBeNull();
    expect(overview.body.data).toHaveProperty("businessCount");

    const regularEmail = uniqueEmail("bootstrap-login-regular");
    const regularAgent = request.agent(app);
    const register = await regularAgent.post("/api/v1/auth/register").send({
      fullName: "Regular User",
      email: regularEmail,
      password: TEST_PASSWORD,
    });
    expect(register.status).toBe(201);
    const denied = await regularAgent.get("/api/v1/admin/overview");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
