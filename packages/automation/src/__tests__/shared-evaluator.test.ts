import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createTriggerEvaluator, overdueDebtWhere } from "../index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

function uniqueSuffix(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(read(relPath));
}

describe("static deduplication proof: both apps depend on this package, not on a local copy", () => {
  it("apps/api declares @daljir/automation and dry-run imports the canonical helpers", () => {
    const pkg = readJson("apps/api/package.json");
    expect((pkg.dependencies as Record<string, string>)["@daljir/automation"]).toBeDefined();

    const dryRun = read("apps/api/src/modules/automation/test-rule.service.ts");
    expect(dryRun).toContain('from "@daljir/automation"');
    expect(dryRun).toContain("createTriggerEvaluator");
    expect(dryRun).toContain("findLowStockMatches");
    expect(dryRun).toContain("findMatchingDebts");
  });

  it("apps/worker declares @daljir/automation and the BullMQ scan imports the canonical helpers", () => {
    const pkg = readJson("apps/worker/package.json");
    expect((pkg.dependencies as Record<string, string>)["@daljir/automation"]).toBeDefined();

    const scan = read("apps/worker/src/jobs/debt-scan.job.ts");
    expect(scan).toContain('from "@daljir/automation"');
    expect(scan).toContain("createTriggerEvaluator");
    expect(scan).toContain("findLowStockMatches");
    expect(scan).toContain("findMatchingDebts");
  });

  it("local trigger-evaluator files do not reimplement evaluation (no startOfDay/setHours copies)", () => {
    const apiLocal = path.join(repoRoot, "apps/api/src/modules/automation/trigger-evaluator.ts");
    const workerLocal = read("apps/worker/src/automation/trigger-evaluator.ts");

    expect(fs.existsSync(apiLocal)).toBe(false);
    expect(workerLocal).toContain('from "@daljir/automation"');
    expect(workerLocal).not.toContain("setHours");
    expect(workerLocal).not.toContain("startOfDay(");
    expect(workerLocal).not.toMatch(/status:\s*["']OVERDUE["']/);
  });

  it("api, worker, web, and admin Dockerfiles COPY packages/automation/package.json", () => {
    for (const rel of ["apps/api/Dockerfile", "apps/worker/Dockerfile", "apps/web/Dockerfile", "apps/admin/Dockerfile"]) {
      expect(read(rel)).toContain("COPY packages/automation/package.json");
    }
  });
});

describe("runtime proof: overdue and LOW_STOCK matching, including tenant isolation", () => {
  const prisma = new PrismaClient();
  const evaluator = createTriggerEvaluator({ prisma });

  async function createBusiness(label: string) {
    const suffix = uniqueSuffix();
    const business = await prisma.business.create({
      data: {
        name: `${label} ${suffix}`,
        slug: `${label.toLowerCase()}-${suffix}`,
        type: "RETAIL",
        timezone: "Africa/Mogadishu",
      },
    });
    const branch = await prisma.branch.create({
      data: { businessId: business.id, name: "Main", code: `MAIN-${suffix}` },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        businessId: business.id,
        branchId: branch.id,
        name: "Main warehouse",
        code: `WH-${suffix}`,
      },
    });
    return { business, branch, warehouse };
  }

  async function createDebt(params: {
    businessId: string;
    branchId: string;
    warehouseId: string;
    dueDate: Date;
    status?: "PENDING" | "OVERDUE" | "PAID";
  }) {
    const suffix = uniqueSuffix();
    const customer = await prisma.customer.create({
      data: {
        businessId: params.businessId,
        fullName: "Eval Customer",
        phone: `25290${suffix}`.slice(0, 15),
        email: `eval.${suffix}@daljir.test`,
      },
    });
    const sale = await prisma.sale.create({
      data: {
        businessId: params.businessId,
        branchId: params.branchId,
        warehouseId: params.warehouseId,
        customerId: customer.id,
        saleNumber: `S-${suffix}`,
        subtotal: 100,
        totalAmount: 100,
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        businessId: params.businessId,
        saleId: sale.id,
        customerId: customer.id,
        invoiceNumber: `INV-${suffix}`,
        subtotal: 100,
        totalAmount: 100,
        amountDue: 100,
        dueDate: params.dueDate,
      },
    });
    return prisma.customerDebt.create({
      data: {
        businessId: params.businessId,
        customerId: customer.id,
        invoiceId: invoice.id,
        principalAmount: 100,
        outstandingAmount: params.status === "PAID" ? 0 : 100,
        dueDate: params.dueDate,
        status: params.status ?? "PENDING",
      },
    });
  }

  async function createLowStockLine(params: {
    businessId: string;
    warehouseId: string;
    quantity: number;
    threshold: number;
  }) {
    const suffix = uniqueSuffix();
    const product = await prisma.product.create({
      data: {
        businessId: params.businessId,
        name: `Low stock ${suffix}`,
        sku: `SKU-${suffix}`,
        sellingPrice: 10,
        costPrice: 5,
        trackStock: true,
        lowStockThreshold: params.threshold,
      },
    });
    const level = await prisma.stockLevel.create({
      data: {
        businessId: params.businessId,
        warehouseId: params.warehouseId,
        productId: product.id,
        quantity: params.quantity,
      },
    });
    return { product, level };
  }

  it("INVOICE_OVERDUE matches calendar-overdue rows and never a stored OVERDUE flag or another tenant", async () => {
    const tenantA = await createBusiness("AutoEvalOverdueA");
    const tenantB = await createBusiness("AutoEvalOverdueB");

    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 36 * 60 * 60 * 1000);

    const overdueA = await createDebt({
      businessId: tenantA.business.id,
      branchId: tenantA.branch.id,
      warehouseId: tenantA.warehouse.id,
      dueDate: yesterday,
    });
    const futureA = await createDebt({
      businessId: tenantA.business.id,
      branchId: tenantA.branch.id,
      warehouseId: tenantA.warehouse.id,
      dueDate: tomorrow,
    });
    const storedOverdueFutureA = await createDebt({
      businessId: tenantA.business.id,
      branchId: tenantA.branch.id,
      warehouseId: tenantA.warehouse.id,
      dueDate: tomorrow,
      status: "OVERDUE",
    });
    const overdueB = await createDebt({
      businessId: tenantB.business.id,
      branchId: tenantB.branch.id,
      warehouseId: tenantB.warehouse.id,
      dueDate: yesterday,
    });

    const matchesA = await evaluator.findMatchingDebts(tenantA.business.id, {
      type: "INVOICE_OVERDUE",
      offsetDays: null,
    });
    const idsA = matchesA.map((d) => d.id);

    expect(idsA).toContain(overdueA.id);
    expect(idsA).not.toContain(futureA.id);
    expect(idsA).not.toContain(storedOverdueFutureA.id);
    expect(idsA).not.toContain(overdueB.id);
    expect(matchesA.every((d) => d.businessId === tenantA.business.id)).toBe(true);

    const predicate = overdueDebtWhere(new Date(), "Africa/Mogadishu");
    expect(JSON.stringify(predicate)).not.toContain('"OVERDUE"');
    expect(JSON.stringify(predicate)).not.toContain('"DUE_TODAY"');
    expect(JSON.stringify(predicate)).not.toContain('"DUE_SOON"');
  });

  it("LOW_STOCK matches only the calling tenant's at-or-below-threshold lines", async () => {
    const tenantA = await createBusiness("AutoEvalStockA");
    const tenantB = await createBusiness("AutoEvalStockB");

    const lowA = await createLowStockLine({
      businessId: tenantA.business.id,
      warehouseId: tenantA.warehouse.id,
      quantity: 2,
      threshold: 10,
    });
    const okA = await createLowStockLine({
      businessId: tenantA.business.id,
      warehouseId: tenantA.warehouse.id,
      quantity: 50,
      threshold: 10,
    });
    const lowB = await createLowStockLine({
      businessId: tenantB.business.id,
      warehouseId: tenantB.warehouse.id,
      quantity: 1,
      threshold: 10,
    });

    const matchesA = await evaluator.findLowStockMatches(tenantA.business.id);
    const idsA = matchesA.map((m) => m.stockLevelId);

    expect(idsA).toContain(lowA.level.id);
    expect(idsA).not.toContain(okA.level.id);
    expect(idsA).not.toContain(lowB.level.id);
    expect(matchesA.every((m) => m.businessId === tenantA.business.id)).toBe(true);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
