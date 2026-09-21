import type { NextFunction, Request, Response } from "express";
import { ACCESS_COOKIE } from "../lib/cookies.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/tokens.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) {
      throw unauthorized();
    }

    let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
    try {
      payload = await verifyAccessToken(token);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw unauthorized("Invalid access token");
    }

    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
    });

    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt < new Date()) {
      throw unauthorized("Session expired");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== "ACTIVE") {
      throw unauthorized("Account is not active");
    }

    req.auth = {
      userId: user.id,
      sessionId: session.id,
      user,
    };
    next();
  } catch (error) {
    next(error);
  }
}
