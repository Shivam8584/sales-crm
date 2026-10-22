"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { LOGO_ACCEPT } from "@/lib/domain/logo";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import AccountLogo from "./account-logo";
import { useLogoPick, useLogoUpload } from "./use-logo";

type LogoAccount = {
  _id: Id<"accounts">;
  name: string;
  domain: string | null;
  logoUrl?: string;
  logoStorageId?: Id<"_storage">;
};

/** The account's logo as a button that opens the upload dialog. */
export default function AccountLogoButton({
  account,
}: {
  account: LogoAccount;
}) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { picked, pick, clear } = useLogoPick();
  const upload = useLogoUpload();
  const setLogo = useMutation(api.accounts.setLogo);
  const [busy, setBusy] = useState(false);

  function onOpenChange(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (!next) clear();
  }

  async function run(task: () => Promise<string | null>, done: string) {
    setBusy(true);
    try {
      const message = await task();
      if (message) {
        toast(message, { tone: "danger" });
        return;
      }
      toast(done);
      setOpen(false);
      clear();
    } catch (error) {
      toast(readError(error, "Couldn't update the logo").message, {
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Change logo"
        onClick={() => setOpen(true)}
        className="group focus-visible:ring-ring relative shrink-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2"
      >
        <AccountLogo account={account} size="lg" />
        <span
          aria-hidden
          className="bg-background/80 duration-fast absolute inset-0 flex items-center justify-center rounded-xl text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          Change
        </span>
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-100">
          <DialogHeader>
            <DialogTitle>Account logo</DialogTitle>
            <DialogDescription>
              PNG, JPEG or WebP, up to 1 MB. Without one, the website&apos;s
              icon is used.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 px-6 py-5">
            <AccountLogo
              account={{ ...account, logoUrl: picked?.url ?? account.logoUrl }}
              size="lg"
            />
            <input
              ref={input}
              type="file"
              hidden
              aria-label="Logo file"
              accept={LOGO_ACCEPT}
              onChange={(event) => {
                pick(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {picked ? "Choose another" : "Choose image"}
            </Button>
            {picked && (
              <span
                title={picked.file.name}
                className="caption-style text-fg-secondary min-w-0 truncate"
              >
                {picked.file.name}
              </span>
            )}
          </div>
          <DialogFooter>
            {account.logoStorageId && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                className="text-danger mr-auto"
                onClick={() =>
                  void run(async () => {
                    await setLogo({ id: account._id, storageId: null });
                    return null;
                  }, "Custom logo removed")
                }
              >
                Remove custom logo
              </Button>
            )}
            <DialogClose asChild>
              <Button variant="secondary" size="sm" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              loading={busy && Boolean(picked)}
              disabled={!picked}
              onClick={() =>
                picked &&
                void run(() => upload(account._id, picked.file), "Logo updated")
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
