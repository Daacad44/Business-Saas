import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./lib/env.js";
import { sendData } from "./lib/response.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { branchesRouter } from "./modules/branches/branches.routes.js";
import { businessesRouter } from "./modules/businesses/businesses.routes.js";
import { permissionsRouter, rolesRouter } from "./modules/roles/roles.routes.js";
import { invitationsRouter, usersRouter } from "./modules/users/users.routes.js";
import { warehousesRouter } from "./modules/warehouses/warehouses.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
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

  app.use(errorHandler);
  return app;
}
