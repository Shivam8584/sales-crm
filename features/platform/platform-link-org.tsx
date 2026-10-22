"use client";

import { type FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { useSync } from "./platform-header";

/** Mirrors the server check so a typo doesn't round-trip. */
const ORG_ID = /^org_[0-9a-z]{26}$/;

export function LinkOrg({
  accountId,
  accountName,
  canSync,
}: {
  accountId: Id<"accounts">;
  accountName: string;
  canSync: boolean;
}) {
  const link = useMutation(api.account360.linkOrg);
  const sync = useSync(accountId);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ORG_ID.test(value.trim().toLowerCase())) {
      setError(
        "That isn't a Hypedrive organisation ID. It starts with org_ and has 26 more letters and digits.",
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { previous } = await link({ accountId, orgId: value });
      toast(
        `${accountName} linked to Hypedrive`,
        () => void link({ accountId, orgId: previous }),
      );
      if (canSync) await sync.run(true);
    } catch (caught) {
      const read = readError(caught, "Couldn't link the organisation");
      setError(read.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <EmptyState
        title="Link to a Hypedrive organisation"
        description="Paste the organisation ID from Hypedrive admin to see this brand's health, wallet, campaigns and team here."
        action={
          <form
            onSubmit={(event) => void submit(event)}
            className="flex w-full max-w-md flex-col gap-3 text-left sm:flex-row sm:items-start"
          >
            <Field
              label="Organisation ID"
              htmlFor="platform-org-id"
              error={error}
              className="min-w-0 flex-1 [&_label]:sr-only"
            >
              <Input
                id="platform-org-id"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(undefined);
                }}
                placeholder="org_01jc…"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "platform-org-id-error" : undefined}
                className="font-mono text-xs"
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="control"
              className="h-9 px-3.5"
              loading={busy}
              disabled={!value.trim()}
            >
              Link organisation
            </Button>
          </form>
        }
        className="py-12"
      />
    </div>
  );
}
