import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = sha256Hex(`${salt}:${password}`);
  return `scram-v1$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scram-v1") return false;
  const [, salt, hash] = parts;
  const candidate = sha256Hex(`${salt}:${password}`);
  if (candidate.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function newIdempotencyKey(): string {
  // 与前端 uuid 兼容的请求号
  return randomUUID();
}
