import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export type AccessTokenPayload = {
  sub: string;
  sid: string;
};

export function createRefreshToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function signAccessToken(payload: AccessTokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessSecret);
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
    throw new Error("Invalid access token");
  }
  return { sub: payload.sub, sid: payload.sid };
}

export function refreshExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return expiresAt;
}
