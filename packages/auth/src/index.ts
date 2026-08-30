export const API_KEY_PREFIX = "aeo_live_";

function encodeSecret(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${encodeSecret(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, 20);
}

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function equalHash(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyApiKey(
  key: string,
  acceptedHashes: readonly string[],
): Promise<boolean> {
  if (!key.startsWith(API_KEY_PREFIX)) return false;
  const candidate = await hashApiKey(key);
  return acceptedHashes.some((hash) => equalHash(candidate, hash));
}
