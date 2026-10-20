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
