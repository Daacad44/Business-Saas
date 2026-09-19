import type { CookieOptions, Response } from "express";
import { env, isProd } from "./env.js";

export const ACCESS_COOKIE = "daljir_at";
export const REFRESH_COOKIE = "daljir_rt";
export const BUSINESS_COOKIE = "daljir_bid";

function baseCookie(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || isProd,
    sameSite: "lax",
    path: "/",
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie(),
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie(),
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response) {
  const options = baseCookie();
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

export function setBusinessCookie(res: Response, businessId: string) {
  res.cookie(BUSINESS_COOKIE, businessId, {
    ...baseCookie(),
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearBusinessCookie(res: Response) {
  res.clearCookie(BUSINESS_COOKIE, baseCookie());
}
