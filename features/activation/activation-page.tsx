"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import { Page, PageHeader, PageViews } from "@/components/shell/page";
import { useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import ExpansionView from "./expansion-view";
import HealthView from "./health-view";
import RunChecksButton from "./run-checks-button";
import StuckView from "./stuck-view";
import { routes } from "@/lib/routes";

const VIEWS = ["stuck", "health", "expansion"] as const;
type View = (typeof VIEWS)[number];

/** Brands on Hypedrive: who is stuck, how healthy each one is, and who is ready to buy more. Managers and admins only. */
export default function ActivationPage() {
  const viewer = useViewer();
  if (viewer.role === "rep") {
    return (
      <Page>
        <PageHeader title="Activation" />
        <EmptyState
          title="Your stuck brands are on Today"
          description="The activation desk is for managers. Brands you own that stall show up on Today."
          action={
            <Button variant="secondary" size="sm" href={routes.today}>
              Open Today
            </Button>
          }
        />
      </Page>
    );
  }
  return <ActivationDesk />;
}

function ActivationDesk() {
  const desk = useQuery(api.activation.desk, {});
  const health = useQuery(api.activation.health, {});
  const [param, setView] = useUrlState("view", "stuck");
  const view: View = (VIEWS as readonly string[]).includes(param)
    ? (param as View)
    : "stuck";
  const expanding = health?.filter((row) => row.signals.length > 0);

  return (
    <Page>
      <PageHeader
        title="Activation"
        meta={
          desk && (
            <span className="text-fg-tertiary text-sm tabular-nums">
              {desk.rows.length} stuck · {desk.linked} on Hypedrive
            </span>
          )
        }
        actions={<RunChecksButton />}
      />
      <PageViews
        label="Activation views"
        value={view}
        onChange={setView}
        views={[
          { id: "stuck", label: "Stuck", count: desk?.rows.length },
          { id: "health", label: "Health", count: health?.length },
          { id: "expansion", label: "Expansion", count: expanding?.length },
        ]}
      />
      {view === "stuck" && <StuckView desk={desk} />}
      {view === "health" && <HealthView rows={health} />}
      {view === "expansion" && <ExpansionView rows={expanding} />}
    </Page>
  );
}
