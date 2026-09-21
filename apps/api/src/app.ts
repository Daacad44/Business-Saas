import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./lib/env.js";
import { forbidden } from "./lib/errors.js";
import { sendData } from "./lib/response.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { branchesRouter } from "./modules/branches/branches.routes.js";
import { businessesRouter } from "./modules/businesses/businesses.routes.js";
import { customersRouter, debtsRouter } from "./modules/customers/customers.routes.js";
import { permissionsRouter, rolesRouter } from "./modules/roles/roles.routes.js";
import { invoicesRouter, salesRouter } from "./modules/sales/sales.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { invitationsRouter, usersRouter } from "./modules/users/users.routes.js";
import { warehousesRouter } from "./modules/warehouses/warehouses.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import {
  batchesRouter,
  categoriesRouter,
  productsRouter,
  stockAdjustmentsRouter,
  stockLevelsRouter,
  stockMovementsRouter,
  stockTransfersRouter,
  unitsRouter,
} from "./modules/inventory/index.js";
import { expenseCategoriesRouter } from "./modules/expenses/expense-categories.routes.js";
import { expensesRouter } from "./modules/expenses/expenses.routes.js";
import { payablesRouter } from "./modules/purchases/payables.routes.js";
import { purchaseOrdersRouter } from "./modules/purchases/purchase-orders.routes.js";
import { purchasesRouter } from "./modules/purchases/purchases.routes.js";
import { suppliersRouter } from "./modules/purchases/suppliers.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  const allowedOrigins = new Set([env.WEB_ORIGIN, env.ADMIN_ORIGIN]);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
        } else {
          callback(forbidden("Origin not allowed by CORS"));
        }
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    sendData(res, { status: "ok", service: "daljir-api" });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/businesses", businessesRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/invitations", invitationsRouter);
  app.use("/api/v1/roles", rolesRouter);
  app.use("/api/v1/permissions", permissionsRouter);
  app.use("/api/v1/branches", branchesRouter);
  app.use("/api/v1/warehouses", warehousesRouter);
  app.use("/api/v1/units", unitsRouter);
  app.use("/api/v1/categories", categoriesRouter);
  app.use("/api/v1/products", productsRouter);
  app.use("/api/v1/batches", batchesRouter);
  app.use("/api/v1/inventory/stock-levels", stockLevelsRouter);
  app.use("/api/v1/inventory/movements", stockMovementsRouter);
  app.use("/api/v1/inventory/adjustments", stockAdjustmentsRouter);
  app.use("/api/v1/inventory/transfers", stockTransfersRouter);
  app.use("/api/v1/customers", customersRouter);
  app.use("/api/v1/debts", debtsRouter);
  app.use("/api/v1/sales", salesRouter);
  app.use("/api/v1/invoices", invoicesRouter);
  app.use("/api/v1/suppliers", suppliersRouter);
  app.use("/api/v1/purchase-orders", purchaseOrdersRouter);
  app.use("/api/v1/purchases", purchasesRouter);
  app.use("/api/v1/payables", payablesRouter);
  app.use("/api/v1/expense-categories", expenseCategoriesRouter);
  app.use("/api/v1/expenses", expensesRouter);
  app.use("/api/v1/reports", reportsRouter);
  app.use("/api/v1/admin", adminRouter);

  app.use(errorHandler);
  return app;
}
