"use client";

import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Page, PageHeader } from "@/components/shell/page";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_RANK } from "@/lib/domain/enums";
import PlaybookBrowser, { type PlaybookEntry } from "./playbook-browser";
import PlaybookDialog from "./playbook-dialog";
import PlaybookSheet from "./playbook-sheet";

/** Answers, battlecards, case studies and demo agendas; everyone reads and copies, managers write. */
export default function PlaybookPage() {
  const viewer = useViewer();
  const canEdit = ROLE_RANK[viewer.role] >= ROLE_RANK.manager;
  const [openId, setOpenId] = useState<Id<"playbook"> | null>(null);
  const [editing, setEditing] = useState<{ entry?: PlaybookEntry } | null>(
    null,
  );

  return (
    <Page>
      <PageHeader title="Playbook" />
      <PlaybookBrowser
        onSelect={(entry) => setOpenId(entry._id)}
        onNew={canEdit ? () => setEditing({}) : undefined}
      />
      <PlaybookSheet
        id={openId}
        canEdit={canEdit}
        onClose={() => setOpenId(null)}
        onEdit={(entry) => {
          setOpenId(null);
          setEditing({ entry });
        }}
      />
      {canEdit && (
        <PlaybookDialog
          open={editing !== null}
          entry={editing?.entry}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </Page>
  );
}
