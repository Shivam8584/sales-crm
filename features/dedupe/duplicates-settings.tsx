"use client";

import { useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import { Card } from "@/components/_ui/card";
import EmptyState from "@/components/_ui/empty-state";
import SegmentedControl from "@/components/_ui/segmented-control";
import {
  SettingsIntro,
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
} from "@/features/settings/settings-ui";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_RANK } from "@/lib/domain/enums";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import SettingsIcon from "@/public/assets/icons/settings.svg";
import { ReasonTags } from "./reason-tags";
import { ReviewDialog } from "./review-dialog";
import {
  MAX_PAIRS,
  useDuplicateScan,
  type DedupeType,
  type ScanPair,
} from "./use-duplicate-scan";
import { routes } from "@/lib/routes";

const TYPES = [
  { value: "accounts", label: "Accounts" },
  { value: "people", label: "People" },
];

function ManagerOnly({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  if (ROLE_RANK[viewer.role] >= ROLE_RANK.manager) return <>{children}</>;
  return (
    <Card className="py-6">
      <EmptyState
        icon={SettingsIcon}
        title="Only managers can merge records"
        description="Ask a manager or admin on your team to review duplicates."
        action={
          <Button variant="secondary" size="sm" href={routes.profile}>
            Back to your profile
          </Button>
        }
      />
    </Card>
  );
}

/** /settings/duplicates: records that look like the same company or person. */
export default function DuplicatesSettings() {
  const [type, setType] = useState<DedupeType>("accounts");
  return (
    <ManagerOnly>
      <SettingsIntro>
        Records that share a GSTIN, website, email or phone, or have
        near-identical names. Merging moves everything onto the record you keep
        and archives the other one.
      </SettingsIntro>
      <SegmentedControl
        label="Records"
        value={type}
        onChange={(value) => setType(value as DedupeType)}
        segments={TYPES}
        className="self-start"
      />
      <DuplicateList key={type} type={type} />
    </ManagerOnly>
  );
}

function DuplicateList({ type }: { type: DedupeType }) {
  const { pairs, labels, done, rescan, without } = useDuplicateScan(type);
  const [reviewing, setReviewing] = useState<ScanPair | null>(null);
  const noun = type === "accounts" ? "accounts" : "people";

  if (!done && pairs.length === 0) return <SettingsSkeleton rows={3} />;
  if (done && pairs.length === 0) {
    return (
      <Card className="py-6">
        <EmptyState
          icon={CheckCircleIcon}
          title={`No duplicate ${noun} found`}
          description="New matches show up here when records share a GSTIN, website, email or phone, or have very similar names."
          action={
            <Button variant="secondary" size="sm" onClick={rescan}>
              Scan again
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <SettingsSection
      title={`Possible duplicate ${noun}`}
      description={
        done
          ? pairs.length >= MAX_PAIRS
            ? `Showing the first ${MAX_PAIRS}, strongest matches first.`
            : `${pairs.length} found, strongest matches first.`
          : `${pairs.length} found so far. Still looking…`
      }
    >
      {pairs.map((pair) => (
        <SettingsRow
          key={`${pair.a}|${pair.b}`}
          label={`${labels.get(pair.a)?.name ?? "Unknown"} and ${labels.get(pair.b)?.name ?? "Unknown"}`}
          description={<ReasonTags reasons={pair.reasons} />}
        >
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setReviewing(pair)}
          >
            Review
          </Button>
        </SettingsRow>
      ))}
      {reviewing && (
        <ReviewDialog
          type={type}
          ids={[reviewing.a, reviewing.b]}
          open
          onOpenChange={(open) => !open && setReviewing(null)}
          onMerged={(loserId) => without(loserId)}
          onDismissed={() => without(reviewing.a, reviewing.b)}
        />
      )}
    </SettingsSection>
  );
}
