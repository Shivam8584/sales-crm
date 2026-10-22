"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/_ui/collapsible";
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
import { Textarea } from "@/components/_ui/textarea";
import OptionPicker from "@/components/fields/option-picker";
import {
  MAX_INSTRUCTION,
  MAX_NAME,
  type AgentScope,
  type AgentTrigger,
} from "@/lib/domain/agents";
import { readError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { toast } from "@/stores/toast-store";
import TriggerPicker, { DEFAULT_TRIGGER } from "./trigger-picker";

export const PICKER_CLASS = "bg-well mx-0 h-10 w-full px-3";

export const SCOPE_OPTIONS = [
  { value: "own", label: "My records", hint: "Only records you own" },
  {
    value: "team",
    label: "The whole team",
    hint: "Everything you can see as an admin",
  },
];

export default function NewAgentDialog({
  open,
  onOpenChange,
  canTeam,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canTeam: boolean;
}) {
  const router = useRouter();
  const create = useMutation(api.agents.create);
  const [instruction, setInstruction] = useState("");
  const [trigger, setTrigger] = useState<AgentTrigger>(DEFAULT_TRIGGER);
  const [scope, setScope] = useState<AgentScope>("own");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  function reset() {
    setInstruction("");
    setTrigger(DEFAULT_TRIGGER);
    setScope("own");
    setName("");
    setError(undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!instruction.trim()) return setError("Say what the agent should do");
    setSaving(true);
    setError(undefined);
    try {
      const id = await create({
        instruction,
        trigger,
        scope,
        name: name.trim() || undefined,
      });
      onOpenChange(false);
      router.push(routes.agent(id));
    } catch (reason) {
      const { message, field } = readError(reason, "Couldn't create the agent");
      if (field === "instruction") setError(message);
      else toast(message, { tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-120" onCloseAutoFocus={reset}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>New agent</DialogTitle>
            <DialogDescription>
              Describe the job in a sentence. It starts as a preview: nothing
              changes until you allow it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-5">
            <Field
              label="What should it do?"
              htmlFor="agent-instruction"
              error={error}
            >
              <Textarea
                id="agent-instruction"
                autoFocus
                rows={4}
                maxLength={MAX_INSTRUCTION}
                value={instruction}
                onChange={(event) => {
                  setInstruction(event.target.value);
                  setError(undefined);
                }}
                placeholder="Every Monday, list my deals with no activity for 10 days and make a task for each"
                aria-invalid={error ? true : undefined}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="caption-style text-fg-secondary">When</span>
              <TriggerPicker
                value={trigger}
                onChange={setTrigger}
                className={PICKER_CLASS}
              />
            </div>
            <Collapsible className="group/collapsible flex flex-col">
              <CollapsibleTrigger className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-fast -mx-1 flex w-fit cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 transition-colors outline-none focus-visible:ring-2">
                More options
                <CollapsibleChevron />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-4 pt-4">
                  <Field label="Name" htmlFor="agent-name">
                    <Input
                      id="agent-name"
                      autoComplete="off"
                      maxLength={MAX_NAME}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Taken from the instruction"
                    />
                  </Field>
                  {canTeam && (
                    <div className="flex flex-col gap-2">
                      <span className="caption-style text-fg-secondary">
                        Works on
                      </span>
                      <OptionPicker
                        label="Works on"
                        value={scope}
                        options={SCOPE_OPTIONS}
                        onChange={(next) =>
                          setScope((next ?? "own") as AgentScope)
                        }
                        className={PICKER_CLASS}
                      />
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Create agent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
