export type SecretKey = {
  name: string;
  label: string;
  /** Secrets are never shown again, only their last 4 characters; other values are shown in full. */
  secret: boolean;
  example?: string;
};

export type SecretGroup = {
  id: string;
  label: string;
  description: string;
  keys: SecretKey[];
};

export const SECRET_GROUPS: SecretGroup[] = [
  {
    id: "ai",
    label: "AI",
    description: "Briefs, drafts, call summaries and quick capture.",
    keys: [
      { name: "OPENAI_API_KEY", label: "OpenAI API key", secret: true },
      {
        name: "AI_MODEL",
        label: "Main model",
        secret: false,
        example: "gpt-6.1-sol",
      },
      {
        name: "AI_MODEL_FAST",
        label: "Fast model",
        secret: false,
        example: "gpt-6-luna",
      },
      {
        name: "OPENAI_BASE_URL",
        label: "Base URL",
        secret: false,
        example: "https://api.openai.com/v1",
      },
    ],
  },
  {
    id: "enrichment",
    label: "GST and DIN verification",
    description: "The KYC service behind registry lookups.",
    keys: [
      {
        name: "KYC_BASE_URL",
        label: "Service URL",
        secret: false,
        example: "https://kyc.example.com",
      },
      { name: "KYC_API_TOKEN", label: "API token", secret: true },
      {
        name: "KYC_HMAC_SECRET",
        label: "Response signing secret",
        secret: true,
      },
    ],
  },
  {
    id: "calls",
    label: "Exotel calling",
    description: "Click-to-call. Every Exotel value is needed.",
    keys: [
      { name: "EXOTEL_SID", label: "Account SID", secret: false },
      { name: "EXOTEL_API_KEY", label: "API key", secret: true },
      { name: "EXOTEL_API_TOKEN", label: "API token", secret: true },
      {
        name: "EXOTEL_SUBDOMAIN",
        label: "API host",
        secret: false,
        example: "api.in.exotel.com",
      },
      { name: "EXOTEL_CALLER_ID", label: "ExoPhone number", secret: false },
      { name: "EXOTEL_WEBHOOK_SECRET", label: "Callback secret", secret: true },
    ],
  },
  {
    id: "slack",
    label: "Slack",
    description:
      "Set the bot token, or a webhook URL if you can't install an app.",
    keys: [
      { name: "SLACK_BOT_TOKEN", label: "Bot token", secret: true },
      { name: "SLACK_SIGNING_SECRET", label: "Signing secret", secret: true },
      {
        name: "SLACK_WEBHOOK_URL",
        label: "Incoming webhook URL",
        secret: true,
        example: "https://hooks.slack.com/services/…",
      },
    ],
  },
];

export const SECRET_KEYS = SECRET_GROUPS.flatMap((group) => group.keys);

export const secretKey = (name: string) =>
  SECRET_KEYS.find((key) => key.name === name);

export const MAX_SECRET_LENGTH = 500;

export function hintFor(key: SecretKey, value: string) {
  return key.secret ? value.slice(-4) : value;
}

/** The cleaned value, or the reason it can't be stored. */
export function checkSecretValue(
  key: SecretKey,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value)
    return { ok: false, error: `Enter the ${key.label.toLowerCase()}` };
  if (value.length > MAX_SECRET_LENGTH) {
    return { ok: false, error: "That value is too long" };
  }
  if (/\s/.test(value)) {
    return { ok: false, error: "Remove the spaces and line breaks" };
  }
  if (key.name.endsWith("_URL")) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw url;
    } catch {
      return { ok: false, error: "Enter a full URL starting with https://" };
    }
  }
  return { ok: true, value };
}
