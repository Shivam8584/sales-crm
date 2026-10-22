"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import AccountLogo from "@/features/accounts/account-logo";
import { StageTag } from "@/features/accounts/stage";
import { aiError } from "./use-ai";

type Found = FunctionReturnType<typeof api.ai.similarAccounts>;

export default function SimilarAccounts({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  const find = useAction(api.ai.similarAccounts);
  const [found, setFound] = useState<Found | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      setFound(await find({ accountId }));
    } catch (error) {
      aiError(error, "Couldn't find similar accounts");
    } finally {
      setPending(false);
    }
  }

  if (!found) {
    return (
      <Button
        variant="ghost"
        size="xs"
        loading={pending}
        onClick={() => void run()}
        className="self-start"
      >
        Find similar accounts
      </Button>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {found.length === 0 ? (
        <p className="caption-style text-fg-secondary">
          Nothing close yet — embeddings fill in overnight
        </p>
      ) : (
        <ul className="flex flex-col gap-px">
          {found.map((item) => (
            <li key={item.accountId}>
              <Link
                href={`/accounts/${item.accountId}`}
                className="hover:bg-overlay-1 focus-visible:ring-ring -mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 outline-none focus-visible:ring-2"
              >
                <AccountLogo account={item} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm">{item.name}</span>
                  <span className="caption-style text-fg-tertiary truncate">
                    {[
                      item.score === "close" ? "Close match" : "Similar",
                      ...item.reasonWords,
                    ].join(" · ")}
                  </span>
                </span>
                <StageTag stage={item.stage} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setFound(null)}
        className="self-start"
      >
        Clear
      </Button>
    </div>
  );
}
