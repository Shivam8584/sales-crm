"use client";

import { useState, type FormEvent } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button, { buttonVariants } from "@/components/_ui/button";
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
import SegmentedControl from "@/components/_ui/segmented-control";
import { Textarea } from "@/components/_ui/textarea";
import { whatsappHref } from "@/features/leads/lead-meta";
import { toast } from "@/stores/toast-store";
import { aiError } from "./use-ai";

type Target = FunctionArgs<typeof api.ai.draft>["target"];
type Channel = FunctionArgs<typeof api.ai.draft>["channel"];

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
];

const LINK = buttonVariants({ variant: "secondary", size: "sm" });

/** Drafts a message for a record; nothing is sent, the member copies it or opens it in their own app. */
export function DraftDialog({
  target,
  open,
  onOpenChange,
}: {
  target: Target;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-110">
        <DraftForm target={target} />
      </DialogContent>
    </Dialog>
  );
}

function useContact(target: Target) {
  const personId = "personId" in target ? target.personId : undefined;
  const leadId = "leadId" in target ? target.leadId : undefined;
  const dealId = "dealId" in target ? target.dealId : undefined;
  const person = useQuery(api.people.get, personId ? { id: personId } : "skip");
  const lead = useQuery(api.leads.get, leadId ? { id: leadId } : "skip");
  const deal = useQuery(api.deals.get, dealId ? { id: dealId } : "skip");
  const dealPersonId = deal?.personIds[0];
  const dealPerson = useQuery(
    api.people.get,
    dealPersonId ? { id: dealPersonId } : "skip",
  );
  const contact = person ?? lead ?? dealPerson;
  return {
    phone: contact?.phone || undefined,
    email: contact?.email || undefined,
  };
}

function DraftForm({ target }: { target: Target }) {
  const draft = useAction(api.ai.draft);
  const { phone, email } = useContact(target);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [goal, setGoal] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  async function generate(event?: FormEvent) {
    event?.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const result = await draft({
        target,
        channel,
        goal: goal.trim() || undefined,
      });
      setSubject(result.subject ?? "");
      setBody(result.body);
      setGenerated(true);
    } catch (error) {
      aiError(error, "Couldn't write a draft");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    const text =
      channel === "email" && subject ? `${subject}\n\n${body}` : body;
    navigator.clipboard.writeText(text).then(
      () => toast("Copied"),
      () => toast("Couldn't copy", { tone: "danger" }),
    );
  }

  const text = encodeURIComponent(body);
  const href =
    channel === "whatsapp"
      ? phone && `${whatsappHref(phone)}?text=${text}`
      : email &&
        `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${text}`;

  return (
    <form onSubmit={generate} noValidate>
      <DialogHeader>
        <DialogTitle>Draft a message</DialogTitle>
        <DialogDescription>
          AI writes a draft. Nothing is sent until you send it yourself.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 px-6 py-5">
        <SegmentedControl
          label="Channel"
          value={channel}
          onChange={(value) => setChannel(value as Channel)}
          segments={CHANNELS}
          className="self-start"
        />
        <Field label="What should it say?" htmlFor="draft-goal">
          <Input
            id="draft-goal"
            autoFocus
            autoComplete="off"
            maxLength={200}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Follow up on the proposal"
          />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={loading}
          className="self-start"
        >
          {generated ? "Regenerate" : "Generate"}
        </Button>
        {generated && channel === "email" && (
          <Field label="Subject" htmlFor="draft-subject">
            <Input
              id="draft-subject"
              autoComplete="off"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Field>
        )}
        {generated && (
          <Field label="Message" htmlFor="draft-body">
            <Textarea
              id="draft-body"
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="max-h-60"
            />
          </Field>
        )}
      </div>
      <DialogFooter className="flex-wrap">
        <DialogClose asChild>
          <Button variant="subtle" size="sm">
            Close
          </Button>
        </DialogClose>
        {generated && (
          <>
            <Button variant="secondary" size="sm" onClick={copy}>
              Copy
            </Button>
            {href && (
              <a
                href={href}
                target={channel === "whatsapp" ? "_blank" : undefined}
                rel="noopener noreferrer"
                className={LINK}
              >
                {channel === "whatsapp"
                  ? "Open in WhatsApp"
                  : "Open in mail app"}
              </a>
            )}
          </>
        )}
      </DialogFooter>
    </form>
  );
}
