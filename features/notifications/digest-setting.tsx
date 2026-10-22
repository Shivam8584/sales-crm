"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Switch } from "@/components/_ui/switch";
import { SettingsRow } from "@/features/settings/settings-ui";
import { useViewer } from "@/hooks/use-viewer";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export function DigestSetting() {
  const viewer = useViewer();
  const setDigest = useMutation(api.members.setDigest);
  const setWeekly = useMutation(api.members.setWeekly);

  const report = (reason: unknown, fallback: string) =>
    toast(readError(reason, fallback).message, { tone: "danger" });

  return (
    <>
      <SettingsRow
        label="Daily email digest"
        htmlFor="daily-digest"
        description="What needs you, every weekday at 9:00 IST."
      >
        <Switch
          id="daily-digest"
          checked={viewer.digestOff !== true}
          onCheckedChange={(checked) =>
            void setDigest({ off: !checked }).catch((reason) =>
              report(reason, "Couldn't update the digest"),
            )
          }
        />
      </SettingsRow>
      {viewer.role !== "rep" && (
        <SettingsRow
          label="Weekly team report"
          htmlFor="weekly-report"
          description="Last week against the one before, Mondays at 9:30 IST."
        >
          <Switch
            id="weekly-report"
            checked={viewer.weeklyOff !== true}
            onCheckedChange={(checked) =>
              void setWeekly({ off: !checked }).catch((reason) =>
                report(reason, "Couldn't update the weekly report"),
              )
            }
          />
        </SettingsRow>
      )}
    </>
  );
}
