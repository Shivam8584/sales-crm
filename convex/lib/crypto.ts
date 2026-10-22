export function randomToken(bytes = 24) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

const KEY_ENV = "KEYS_ENCRYPTION_KEY";
const MIN_KEY_LENGTH = 32;
const IV_BYTES = 12;
const VERSION = "v1";

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/** Whether the deployment has a usable master key; without one nothing can be stored encrypted. */
export function encryptionConfigured() {
  return (process.env[KEY_ENV]?.trim().length ?? 0) >= MIN_KEY_LENGTH;
}

async function masterKey(usage: "encrypt" | "decrypt") {
  const secret = process.env[KEY_ENV]?.trim() ?? "";
  if (secret.length < MIN_KEY_LENGTH) {
    throw new Error(
      `${KEY_ENV} must be set to at least ${MIN_KEY_LENGTH} characters`,
    );
  }
  // Hashing lets any long random string serve as the AES-256 key.
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [usage]);
}

/**
 * AES-256-GCM with a random IV, returned as `v1.<iv>.<ciphertext+tag>`.
 * `context` is authenticated but not stored, so a value can't be moved to another slot.
 */
export async function encryptSecret(plaintext: string, context = "") {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(context),
    },
    await masterKey("encrypt"),
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

/** Throws if the payload was tampered with, belongs to another context, or the master key changed. */
export async function decryptSecret(payload: string, context = "") {
  const [version, iv, sealed] = payload.split(".");
  if (version !== VERSION || !iv || !sealed) {
    throw new Error("Unrecognised encrypted value");
  }
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(iv),
      additionalData: new TextEncoder().encode(context),
    },
    await masterKey("decrypt"),
    fromBase64(sealed),
  );
  return new TextDecoder().decode(plain);
}
