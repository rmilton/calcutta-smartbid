import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

function getSharedCodeEncryptionKey() {
  const secret =
    process.env.SHARED_CODE_ENCRYPTION_SECRET ??
    process.env.AUTH_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "local-calcutta-smartbid-shared-code-secret";

  return createHash("sha256").update(secret).digest();
}

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

export function encryptSharedCode(sharedCode: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSharedCodeEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(sharedCode.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSharedCode(ciphertext: string) {
  const [version, ivHex, tagHex, payloadHex] = ciphertext.split(":");
  if (version !== "v1" || !ivHex || !tagHex || !payloadHex) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getSharedCodeEncryptionKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payloadHex, "hex")),
      decipher.final()
    ]).toString("utf8");

    return plaintext;
  } catch {
    return null;
  }
}
