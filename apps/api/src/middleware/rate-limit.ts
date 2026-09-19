import rateLimit from "express-rate-limit";
import { env } from "../lib/env.js";

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "test" ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    data: null,
    error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." },
  },
});
