"use client";

import type { ReactNode } from "react";
import CountBadge from "@/components/_ui/count-badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/_ui/tabs";
import { useUrlState } from "@/hooks/use-url-state";

export type RecordTab = {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
};

/** Sections of a record page; the open tab lives in `?tab=` so links can target it. */
export default function RecordTabs({ tabs }: { tabs: RecordTab[] }) {
  const [param, setParam] = useUrlState("tab", tabs[0]?.id ?? "");
  const value = tabs.some((tab) => tab.id === param) ? param : tabs[0]?.id;

  return (
    <Tabs value={value} onValueChange={setParam}>
      <TabsList className="border-border bg-background z-sticky-header scrollbar-none sticky top-0 -mx-1 gap-5 overflow-x-auto border-b px-1">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="py-3 text-sm">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <CountBadge>{tab.count}</CountBadge>
              )}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="pt-5">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
