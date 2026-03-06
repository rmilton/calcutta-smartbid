import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function createSharedCodeLookup(sharedCode: string) {
  return createHmac("sha256", "calcutta-shared-code-lookup")
    .update(sharedCode.trim().toLowerCase())
    .digest("hex");
}

export function hashSharedCode(sharedCode: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(sharedCode.trim(), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifySharedCode(sharedCode: string, storedHash: string) {
  const [salt, stored] = storedHash.split(":");
  if (!salt || !stored) {
    return false;
  }

  const hash = scryptSync(sharedCode.trim(), salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash), Buffer.from(stored));
}
