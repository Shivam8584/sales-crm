const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const GSTIN_LENGTH = 15;

export function normalizeGstin(input: string) {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function gstinCheckChar(first14: string) {
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const value = ALPHABET.indexOf(first14[index]);
    if (value < 0) return null;
    const product = value * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36];
}

export type GstinCheck =
  | { ok: true; gstin: string }
  | {
      ok: false;
      gstin: string;
      reason: "empty" | "short" | "format" | "checksum";
    };

export function checkGstin(input: string): GstinCheck {
  const gstin = normalizeGstin(input);
  if (!gstin) return { ok: false, gstin, reason: "empty" };
  if (gstin.length < GSTIN_LENGTH) return { ok: false, gstin, reason: "short" };
  if (!PATTERN.test(gstin)) return { ok: false, gstin, reason: "format" };
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, gstin, reason: "checksum" };
  }
  return { ok: true, gstin };
}

/** The PAN embedded in a GSTIN; every GSTIN of one legal entity shares it. */
export function panRoot(gstin: string) {
  const normalized = normalizeGstin(gstin);
  return normalized.length >= 12 ? normalized.slice(2, 12) : null;
}

export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

export function gstinError(check: GstinCheck) {
  if (check.ok) return null;
  switch (check.reason) {
    case "empty":
      return "Enter a GSTIN.";
    case "short":
      return `GSTIN has ${GSTIN_LENGTH} characters (${check.gstin.length} so far).`;
    case "format":
      return "That isn't a GSTIN. It looks like 29AAACI4798L1ZU.";
    case "checksum":
      return "Last character doesn't match the checksum. Check for a typo.";
  }
}
