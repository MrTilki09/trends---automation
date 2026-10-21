import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts per-user secrets (e.g. the NVIDIA API key) before they go into Postgres:
 * AES-256-GCM with a key derived from SECRETS_KEY. Format `v1.<iv>.<tag>.<ciphertext>` (base64url).
 * A DB dump alone does not reveal the keys; changing SECRETS_KEY makes stored keys unreadable
 * (users then simply enter them again).
 */

const keyFrom = (secret: string) => createHash("sha256").update(secret).digest();

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const b = (x: Buffer) => x.toString("base64url");
  return `v1.${b(iv)}.${b(cipher.getAuthTag())}.${b(ct)}`;
}

/** The plain text, or null when the value is malformed or was encrypted with another key. */
export function decryptSecret(enc: string, secret: string): string | null {
  const [v, iv, tag, ct, extra] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !ct || extra !== undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** `nvapi-…AbCd`: enough to recognise a key without revealing it. */
export const maskSecret = (s: string) => (s.length <= 8 ? "••••" : `${s.slice(0, 6)}…${s.slice(-4)}`);
