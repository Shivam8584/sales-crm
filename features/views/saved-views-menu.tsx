"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import FilterIcon from "@/public/assets/icons/filter.svg";
import XIcon from "@/public/assets/icons/x.svg";

/** Params that open a record or dialog rather than shape the list. */
const TRANSIENT = ["peek", "lead", "tab", "invite", "create"];

function listQuery(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  for (const key of TRANSIENT) next.delete(key);
  next.sort();
  return next.toString();
}

/** The member's own saved filter sets for the list they are on. */
export default function SavedViewsMenu() {
  const path = usePathname();
  const router = useRouter();
  const current = listQuery(useSearchParams());
  const views = useQuery(api.views.forPath, { path });
  const save = useMutation(api.views.save);
  const remove = useMutation(api.views.remove);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function apply(query: string) {
    router.replace(query ? `${path}?${query}` : path, { scroll: false });
    setOpen(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save({ path, name, query: current });
      toast(`Saved “${name.trim()}”`);
      setName("");
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function drop(id: NonNullable<typeof views>[number]["_id"]) {
    try {
      await remove({ id });
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-control-md max-sm:w-control-md data-[state=open]:bg-muted py-0 max-sm:px-0"
          aria-label="Saved views"
        >
          <FilterIcon aria-hidden className="size-3" />
          <span className="max-sm:sr-only">Views</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1.5">
        <p className="eyebrow-style text-fg-tertiary px-2 py-1.5">
          Saved views
        </p>
        {views?.length === 0 && (
          <p className="caption-style text-fg-tertiary px-2 pb-2 leading-snug">
            Set filters on this list, then save them to come back in one click.
          </p>
        )}
        <ul className="flex flex-col">
          {views?.map((view) => {
            const active =
              listQuery(new URLSearchParams(view.query)) === current;
            return (
              <li key={view._id} className="group/view flex items-center">
                <button
                  type="button"
                  onClick={() => apply(view.query)}
                  className={cn(
                    "lead-style hover:bg-overlay-2 focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2",
                    active && "bg-overlay-2 font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{view.name}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${view.name}`}
                  onClick={() => void drop(view._id)}
                  className="opacity-0 group-focus-within/view:opacity-100 group-hover/view:opacity-100 pointer-coarse:opacity-100"
                >
                  <XIcon aria-hidden className="size-3" />
                </Button>
              </li>
            );
          })}
        </ul>
        <form
          onSubmit={(event) => void submit(event)}
          className="border-border mt-1 flex gap-1.5 border-t p-1.5 pt-2.5"
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={current ? "Name this view" : "Set filters first"}
            aria-label="View name"
            maxLength={40}
            disabled={!current}
          />
          <Button
            type="submit"
            variant="secondary"
            size="control"
            disabled={!current || !name.trim()}
          >
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
