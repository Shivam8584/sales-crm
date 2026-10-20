"use client";

import { usePathname, useRouter } from "next/navigation";
import { ScrollArea } from "@/components/_ui/scroll-area";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarSection from "./sidebar-section";
import { useCompaniesStore } from "@/stores/companies-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import BuildingIcon from "@/public/assets/images/companies/sidebar/building.svg";
import ClipboardIcon from "@/public/assets/images/companies/sidebar/clipboard.svg";
import BarChartIcon from "@/public/assets/images/companies/sidebar/bar-chart.svg";
import ListIcon from "@/public/assets/images/companies/sidebar/list.svg";
import BookClosedIcon from "@/public/assets/images/companies/sidebar/book-closed.svg";
import MailIcon from "@/public/assets/images/companies/sidebar/mail.svg";
import TargetIcon from "@/public/assets/images/companies/sidebar/target-05.svg";
import UsersIcon from "@/public/assets/images/companies/sidebar/users.svg";
import UserPlusIcon from "@/public/assets/images/companies/sidebar/user-plus.svg";
import MessageQuestionIcon from "@/public/assets/images/companies/sidebar/message-question.svg";
import ActivityIcon from "@/public/assets/images/companies/sidebar/activity.svg";
import CheckSquareIcon from "@/public/assets/images/companies/sidebar/check-square.svg";
import { STAGES, TAG_TONES, type Stage, type TagTone } from "@/data/companies";
import { ANY_STAGE } from "@/lib/companies";
import type { SVGProps } from "react";

const DOT_FILL: Record<TagTone, string> = {
  blue: "fill-(--tag-blue-text)",
  purple: "fill-(--tag-purple-text)",
  green: "fill-(--tag-green-text)",
  moss: "fill-(--tag-moss-text)",
  red: "fill-(--tag-red-text)",
  orange: "fill-(--tag-orange-text)",
  amber: "fill-(--tag-amber-text)",
  teal: "fill-(--tag-teal-text)",
  yellow: "fill-(--tag-yellow-text)",
  neutral: "fill-(--tag-neutral-text)",
};

function stageDot(stage: Stage) {
  function StageDot(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 14 14" {...props}>
        <circle cx="7" cy="7" r="4" className={DOT_FILL[TAG_TONES[stage]]} />
      </svg>
    );
  }
  return StageDot;
}

const STAGE_DOTS = Object.fromEntries(
  STAGES.map((stage) => [stage, stageDot(stage)]),
) as Record<Stage, ReturnType<typeof stageDot>>;

export default function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const companies = useCompaniesStore((state) => state.companies);
  const stage = useCompaniesStore((state) => state.stage);
  const setStage = useCompaniesStore((state) => state.setStage);
  const setSidebarOpen = useCompaniesStore((state) => state.setSidebarOpen);
  const setShortcutsOpen = useCompaniesStore((state) => state.setShortcutsOpen);
  const loaded = useCompaniesStore((state) => state.loaded);
  const onCompanies = pathname === "/" || pathname.startsWith("/companies/");

  const nav = (href: string) => ({
    href,
    active: href === "/" ? onCompanies : pathname.startsWith(href),
    onClick: () => setSidebarOpen(false),
  });

  function pickStage(item: Stage) {
    setSidebarOpen(false);
    if (onCompanies) {
      setStage(stage === item ? ANY_STAGE : item);
      return;
    }
    router.push(`/?stage=${encodeURIComponent(item)}`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center gap-2 border-b p-3">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="lead-style block truncate font-medium tracking-[-0.01em]">
            Hypedrive CRM
          </span>
          <span className="caption-style text-fg-tertiary block truncate">
            Brand pipeline
          </span>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary">
          <SidebarSection className="border-sidebar-border border-b">
            <SidebarNavItem
              icon={BuildingIcon}
              label="Companies"
              count={loaded ? companies.length : undefined}
              {...nav("/")}
            />
            <SidebarNavItem
              icon={TargetIcon}
              label="Leads"
              {...nav("/leads")}
            />
            <SidebarNavItem
              icon={BookClosedIcon}
              label="Contacts"
              {...nav("/contacts")}
            />
            <SidebarNavItem
              icon={ClipboardIcon}
              label="Deals Board"
              {...nav("/deals")}
            />
            <SidebarNavItem
              icon={CheckSquareIcon}
              label="Tasks"
              {...nav("/tasks")}
            />
            <SidebarNavItem
              icon={ActivityIcon}
              label="Activities"
              {...nav("/activities")}
            />
          </SidebarSection>

          <SidebarSection
            title="Coming soon"
            className="border-sidebar-border border-b"
          >
            <SidebarNavItem icon={BarChartIcon} label="Forecast" soon />
            <SidebarNavItem icon={MailIcon} label="Email Sequences" soon />
            <SidebarNavItem icon={ListIcon} label="Reports" soon />
          </SidebarSection>

          <SidebarSection title="Stages">
            {STAGES.map((item) => (
              <SidebarNavItem
                key={item}
                icon={STAGE_DOTS[item]}
                label={item}
                count={
                  !loaded
                    ? undefined
                    : companies.filter((company) => company.tags.includes(item))
                        .length
                }
                pressed={onCompanies && stage === item}
                onClick={() => pickStage(item)}
              />
            ))}
          </SidebarSection>
        </nav>
      </ScrollArea>

      <SidebarSection className="border-sidebar-border shrink-0 border-t">
        <SidebarNavItem
          icon={UsersIcon}
          label="Team"
          tone="quiet"
          {...nav("/team")}
        />
        <SidebarNavItem
          icon={UserPlusIcon}
          label="Invite teammates"
          tone="quiet"
          href="/team?invite=1"
          onClick={() => setSidebarOpen(false)}
        />
        <SidebarNavItem
          icon={MessageQuestionIcon}
          label="Help & shortcuts"
          tone="quiet"
          onClick={() => {
            setSidebarOpen(false);
            setShortcutsOpen(true);
          }}
        />
      </SidebarSection>
    </div>
  );
}
