export const MAX_LOGO_BYTES = 1024 * 1024;

/** No SVG or GIF: SVG can carry scripts. */
export const LOGO_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export const LOGO_TYPE_ERROR = "Use a PNG, JPEG or WebP image";
export const LOGO_SIZE_ERROR = "Logos can be up to 1 MB";

/** The message to show for a file that can't be a logo, or null. */
export function logoProblem(file: { type: string; size: number }) {
  const type = file.type.split(";")[0].trim().toLowerCase();
  if (!LOGO_TYPES.includes(type) || file.size === 0) return LOGO_TYPE_ERROR;
  if (file.size > MAX_LOGO_BYTES) return LOGO_SIZE_ERROR;
  return null;
}

export const LOGO_ACCEPT = LOGO_TYPES.join(",");
