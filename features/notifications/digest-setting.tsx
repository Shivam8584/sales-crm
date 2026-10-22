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

  return (
    <SettingsRow
      label="Daily email digest"
      htmlFor="daily-digest"
      description="A short morning summary of what needs you. Weekdays, 9:00 IST."
    >
      <Switch
        id="daily-digest"
        checked={viewer.digestOff !== true}
        onCheckedChange={(checked) =>
          void setDigest({ off: !checked }).catch((reason) =>
            toast(readError(reason, "Couldn't update the digest").message, {
              tone: "danger",
            }),
          )
        }
      />
    </SettingsRow>
  );
}
