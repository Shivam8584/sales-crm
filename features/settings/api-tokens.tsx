"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import Tag from "@/components/_ui/tag";
import OptionPicker from "@/components/fields/option-picker";
import { MAX_LIVE_TOKENS, type TokenAccess } from "@/lib/domain/mcp";
import { readError } from "@/lib/errors";
import { relativeTime, shortDate } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import {
  CopyField,
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
} from "./settings-ui";

type Token = FunctionReturnType<typeof api.tokens.list>[number];

const ENDPOINT = `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? ""}/mcp`;
const PICKER_CLASS = "border-input bg-secondary mx-0 h-9 w-full border px-3";

const ACCESS = [
  { value: "read", label: "Read only", hint: "Look things up" },
  { value: "write", label: "Read & write", hint: "Also add tasks and notes" },
];
const EXPIRY = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "365 days" },
  { value: "never", label: "Never" },
];

function clientConfig(token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        "hypedrive-crm": {
          type: "http",
          url: ENDPOINT,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

/** Personal tokens that let an AI assistant read your CRM as you. */
export default function ApiTokens() {
  const tokens = useQuery(api.tokens.list, {});
  const [creating, setCreating] = useState(false);

  if (!tokens) return <SettingsSkeleton rows={1} />;
  const active = tokens.filter((token) => !token.revokedAt);

  return (
    <SettingsSection
      title="AI assistants (MCP)"
      description="Connect Claude or another MCP client to look up accounts, deals, tasks and sequences, and optionally add tasks and notes. A token acts as you, with your permissions and no more. Revoke it any time."
      action={
        <Button
          variant="secondary"
          size="xs"
          disabled={
            active.filter((token) => !token.expired).length >= MAX_LIVE_TOKENS
          }
          onClick={() => setCreating(true)}
        >
          Create token
        </Button>
      }
    >
      {active.length === 0 ? (
        <SettingsRow
          label="No tokens yet"
          description="Create one, then paste the config it shows into your MCP client."
        />
      ) : (
        active.map((token) => <TokenRow key={token._id} token={token} />)
      )}
      <CreateDialog open={creating} onOpenChange={setCreating} />
    </SettingsSection>
  );
}

function TokenRow({ token }: { token: Token }) {
  const revoke = useMutation(api.tokens.revoke);
  const [busy, setBusy] = useState(false);
  const { expired } = token;

  async function submit() {
    setBusy(true);
    try {
      await revoke({ id: token._id });
      toast(`Revoked ${token.name}`);
    } catch (error) {
      toast(readError(error, "Couldn't revoke the token").message, {
        tone: "danger",
      });
      setBusy(false);
    }
  }

  return (
    <SettingsRow
      label={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{token.name}</span>
          <Tag tone={token.access === "write" ? "amber" : "blue"} size="xs">
            {token.access === "write" ? "Read & write" : "Read only"}
          </Tag>
          {expired && (
            <Tag tone="neutral" size="xs">
              Expired
            </Tag>
          )}
        </span>
      }
      description={[
        `${token.prefix}…`,
        token.lastUsedAt
          ? `used ${relativeTime(token.lastUsedAt)}`
          : "never used",
        token.expiresAt
          ? `${expired ? "expired" : "expires"} ${shortDate(token.expiresAt)}`
          : "no expiry",
      ].join(" · ")}
    >
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        onClick={() => void submit()}
      >
        Revoke
      </Button>
    </SettingsRow>
  );
}

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.tokens.create);
  const [name, setName] = useState("");
  const [access, setAccess] = useState<TokenAccess>("read");
  const [expiry, setExpiry] = useState("90");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  function reset() {
    setName("");
    setAccess("read");
    setExpiry("90");
    setError(undefined);
    setToken(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Give the token a name");
    setSaving(true);
    setError(undefined);
    try {
      const result = await create({
        name,
        access,
        expiresInDays: expiry === "never" ? undefined : Number(expiry),
      });
      setToken(result.token);
    } catch (reason) {
      setError(readError(reason, "Couldn't create the token").message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-120" onCloseAutoFocus={reset}>
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>Token created</DialogTitle>
              <DialogDescription>
                Copy it now. It can&apos;t be shown again, so if you lose it,
                revoke it and create another.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 px-6 py-5">
              <Field label="Token" htmlFor="mcp-token">
                <CopyField id="mcp-token" label="Token" value={token} />
              </Field>
              <Field
                label="Client config"
                htmlFor="mcp-config"
                hint="Paste into your MCP client's server settings, for example Claude Code or Cursor."
              >
                <CopyField
                  id="mcp-config"
                  label="Client config"
                  value={clientConfig(token)}
                  multiline
                />
              </Field>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="primary" size="sm">
                  Done
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Create token</DialogTitle>
              <DialogDescription>
                It acts as you. Read & write tokens can also add tasks for you
                and notes on records.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 px-6 py-5">
              <Field label="Name" htmlFor="mcp-name" required error={error}>
                <Input
                  id="mcp-name"
                  autoFocus
                  autoComplete="off"
                  maxLength={60}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(undefined);
                  }}
                  placeholder="Claude on my laptop"
                  aria-invalid={error ? true : undefined}
                  className="aria-invalid:border-danger"
                />
              </Field>
              <div className="flex flex-col gap-2">
                <span className="caption-style text-fg-secondary">Access</span>
                <OptionPicker
                  value={access}
                  options={ACCESS}
                  label="Access"
                  onChange={(value) => setAccess(value as TokenAccess)}
                  className={PICKER_CLASS}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="caption-style text-fg-secondary">Expires</span>
                <OptionPicker
                  value={expiry}
                  options={EXPIRY}
                  label="Expires"
                  onChange={(value) => setExpiry(value ?? "90")}
                  className={PICKER_CLASS}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="subtle" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
              >
                Create token
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
