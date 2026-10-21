"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import AutomationDialog, { type AutomationDraft } from "./automation-dialog";
import LinkAccountDialog, { type LinkDraft } from "./link-account-dialog";
import ProspectLeadDialog, { type LeadDraft } from "./prospect-lead-dialog";

export type Prospect = FunctionReturnType<
  typeof api.prospecting.overview
>["brands"][number];

/** The create-lead, add-to-account and automation dialogs for prospect brands. */
export function useProspectActions() {
  const [lead, setLead] = useState<LeadDraft | null>(null);
  const [link, setLink] = useState<LinkDraft | null>(null);
  const [automation, setAutomation] = useState<AutomationDraft | null>(null);

  const createLead = (row: Prospect) =>
    setLead({ key: row.key, brand: row.brand, talkingPoint: row.talkingPoint });

  const addToAccount = (row: Prospect) =>
    setLink({
      key: row.key,
      brand: row.brand,
      linkedId: row.account?.via === "linked" ? row.account._id : null,
    });

  const addToAutomation = (row: Prospect) =>
    setAutomation({
      brand: row.brand,
      target: row.lead?.open
        ? { leadId: row.lead._id as Id<"leads"> }
        : row.account
          ? { accountId: row.account._id as Id<"accounts"> }
          : null,
      label: row.lead?.open
        ? `the lead ${row.lead.name}`
        : row.account
          ? `the account ${row.account.name}`
          : null,
      onCreateLead: () => createLead(row),
    });

  const dialogs = (
    <>
      <ProspectLeadDialog draft={lead} onClose={() => setLead(null)} />
      <LinkAccountDialog draft={link} onClose={() => setLink(null)} />
      <AutomationDialog
        draft={automation}
        onClose={() => setAutomation(null)}
      />
    </>
  );

  return { createLead, addToAccount, addToAutomation, dialogs };
}
