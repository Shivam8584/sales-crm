"use client";

import { useState } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { ScrollArea } from "@/components/_ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import FilterMenu from "@/components/_common/filter-menu";
import DetailSection from "./detail-section";
import PipelineHealth from "./pipeline-health";
import ActivityTrend from "./activity-trend";
import ScoreCard from "./score-card";
import {
  SCORE_CARDS,
  TAG_TONES,
  TREND_WINDOWS,
  ownerByName,
} from "@/data/companies";
import CompanyLogo from "@/components/companies/company-logo";
import { useCompaniesStore } from "@/stores/companies-store";
import BuildingIcon from "@/public/assets/images/companies/detail/building.svg";
import XIcon from "@/public/assets/images/companies/detail/x.svg";
import MailIcon from "@/public/assets/images/companies/detail/mail-04.svg";
import PhoneIcon from "@/public/assets/images/companies/detail/phone.svg";

const WINDOW_OPTIONS = TREND_WINDOWS.map((label) => ({ value: label, label }));

export default function CompanyDetail() {
  const detailId = useCompaniesStore((state) => state.detailId);
  const detailOpen = useCompaniesStore((state) => state.detailOpen);
  const companies = useCompaniesStore((state) => state.companies);
  const closeDetail = useCompaniesStore((state) => state.closeDetail);
  const openProfile = useCompaniesStore((state) => state.openProfile);
  const [trendWindow, setTrendWindow] = useState(TREND_WINDOWS[1]);
  const [scoreWindow, setScoreWindow] = useState(TREND_WINDOWS[1]);

  const company = companies.find((item) => item.id === detailId);
  const owner = company ? ownerByName(company.owner) : null;

  return (
    <Sheet
      open={detailOpen && company !== undefined}
      onOpenChange={(open) => !open && closeDetail()}
    >
      <SheetContent side="right" className="sm:w-140 sm:max-w-140">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <BuildingIcon aria-hidden className="text-icon size-3.5" />
            <SheetTitle>Company details</SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            Account summary, pipeline health, activity and score cards
          </SheetDescription>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mr-2"
              aria-label="Close details"
            >
              <XIcon aria-hidden className="text-foreground size-4" />
            </Button>
          </SheetClose>
        </SheetHeader>

        {company && owner && (
          <ScrollArea className="min-h-0 flex-1">
            <div className="shadow-divider flex items-start gap-3 px-6 py-5">
              <CompanyLogo company={company} size="lg" />
              <div className="flex min-w-0 flex-col gap-3">
                <h2 className="truncate">{company.name}</h2>
                <div className="flex flex-wrap items-center gap-0.75">
                  {company.tags.map((tag) => (
                    <Tag key={tag} tone={TAG_TONES[tag]} size="sm">
                      {tag}
                    </Tag>
                  ))}
                </div>
              </div>
            </div>

            <DetailSection title="Account summary">
              <div className="lead-style flex flex-wrap items-center gap-x-4 gap-y-3">
                <Button
                  variant="ghost"
                  size="inline"
                  onClick={() => openProfile(owner.name)}
                  aria-label={`Open ${owner.name} profile`}
                  className="lead-style text-foreground -my-1 font-medium"
                >
                  <Avatar src={owner.avatar} alt="" />
                  {owner.name}
                </Button>
                <span className="flex items-center gap-1">
                  <MailIcon aria-hidden className="text-fg-secondary size-3" />
                  {owner.email}
                </span>
                <span className="flex items-center gap-1">
                  <PhoneIcon aria-hidden className="text-fg-secondary size-3" />
                  {owner.phone}
                </span>
              </div>
            </DetailSection>

            <DetailSection title="Pipeline health">
              <PipelineHealth company={company} />
            </DetailSection>

            <DetailSection
              title="Activity trend"
              action={
                <FilterMenu
                  value={trendWindow}
                  options={WINDOW_OPTIONS}
                  onChange={setTrendWindow}
                  align="end"
                />
              }
            >
              <ActivityTrend company={company} />
            </DetailSection>

            <DetailSection
              title="Score card"
              className="shadow-none"
              action={
                <FilterMenu
                  value={scoreWindow}
                  options={WINDOW_OPTIONS}
                  onChange={setScoreWindow}
                  align="end"
                  className="shadow-raised"
                />
              }
            >
              <div className="flex flex-col gap-2">
                {SCORE_CARDS.map((card, index) => (
                  <ScoreCard key={`${card.title}-${index}`} card={card} />
                ))}
              </div>
            </DetailSection>
          </ScrollArea>
        )}

        <SheetFooter>
          <Button
            variant="link"
            size="none"
            href="#"
            className="lead-style min-w-0 truncate max-[359px]:hidden"
          >
            Need help? Ask us.
          </Button>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SheetClose asChild>
              <Button variant="subtle" size="sm">
                Cancel
              </Button>
            </SheetClose>
            <Button variant="primary" size="sm" onClick={closeDetail}>
              Save Update
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
