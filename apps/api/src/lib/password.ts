import argon2 from "argon2";

const testMode = process.env.NODE_ENV === "test";

export function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: testMode ? 4096 : 19456,
    timeCost: testMode ? 1 : 2,
  });
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}
