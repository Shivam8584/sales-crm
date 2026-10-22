export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_NAME = 120;

/** Documents and images only; HTML, SVG and scripts can run when opened. */
export const ALLOWED_FILE_TYPES: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];

export const ALLOWED_FILE_EXTENSIONS =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.csv,.txt";

export function cleanFileName(raw: string) {
  const name = raw
    .replace(/[\\/\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (!name) return "file";
  if (name.length <= MAX_FILE_NAME) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : "";
  return name.slice(0, MAX_FILE_NAME - ext.length) + ext;
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
