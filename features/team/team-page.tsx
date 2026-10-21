"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import SearchInput from "@/components/data-table/search-input";
import type { SortState } from "@/components/data-table/types";
import { Page, PageHeader, PageToolbar } from "@/components/shell/page";
import { useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { ROLES } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";
import UsersIcon from "@/public/assets/icons/users.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import InviteDialog from "./invite-dialog";
import InvitesSection from "./invites-section";
import MemberDialog from "./member-dialog";
import MembersTable from "./members-table";
import type { TeamMember } from "./use-member-actions";

const ANY = "any";
const DEFAULT_SORT: SortState = { id: "name", dir: "asc" };
const SORTABLE = ["name", "email", "role", "joined", "status"];

function matches(member: TeamMember, query: string) {
  const text = `${member.name} ${member.email}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

/** Workspace members and invites; admins manage roles, access and invites here. */
export default function TeamPage() {
  const viewer = useViewer();
  const isAdmin = viewer.role === "admin" && viewer.status === "active";
  const team = useQuery(api.members.team, {});
  const params = useSearchParams();

  const [search, setSearch] = useState("");
  const [role, setRole] = useUrlState("role", ANY);
  const [status, setStatus] = useUrlState("status", ANY);
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [inviteParam, setInviteParam] = useUrlState("invite");
  const [memberParam, setMemberParam] = useUrlState("member");
  const [links, setLinks] = useState<Record<string, string>>({});

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: SORTABLE.includes(sortId) ? sortId : DEFAULT_SORT.id,
    dir: sortDir === "desc" ? "desc" : "asc",
  };

  const rows = useMemo(
    () =>
      team?.filter(
        (member) =>
          (role === ANY || member.role === role) &&
          (status === ANY || member.status === status) &&
          (!search.trim() || matches(member, search)),
      ),
    [team, role, status, search],
  );

  const filtered = role !== ANY || status !== ANY || search.trim() !== "";
  const activeCount = team?.filter((member) => member.status === "active");
  const openMember = team?.find((member) => member._id === memberParam);

  function clearFilters() {
    setSearch("");
    setRole(ANY);
    setStatus(ANY);
  }

  function addLink(id: Id<"invites">, url: string) {
    setLinks((current) => ({ ...current, [id]: url }));
  }

  return (
    <Page>
      <PageHeader
        title="Team"
        meta={
          activeCount && (
            <span className="caption-style text-fg-tertiary tabular-nums">
              {activeCount.length} active
            </span>
          )
        }
        actions={
          isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setInviteParam("1")}
            >
              <UserPlusIcon aria-hidden className="size-3" />
              Invite
            </Button>
          )
        }
      />
      <PageToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search members"
        />
        <FilterMenu
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: ANY, label: "Any" },
            ...ROLES.map((value) => ({ value, label: ROLE_LABEL[value] })),
          ]}
        />
        <FilterMenu
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: ANY, label: "Any" },
            { value: "active", label: "Active" },
            { value: "deactivated", label: "Deactivated" },
          ]}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
        {rows && filtered && (
          <span className="caption-style text-fg-tertiary ml-auto tabular-nums">
            {rows.length} of {team?.length}
          </span>
        )}
      </PageToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col">
          <MembersTable
            members={rows}
            team={team ?? []}
            viewerId={viewer._id}
            isAdmin={isAdmin}
            sort={sort}
            onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
            memberHref={(member) => {
              const query = new URLSearchParams(params);
              query.set("member", member._id);
              return `/settings/team?${query}`;
            }}
            empty={
              <EmptyState
                icon={UsersIcon}
                title="No members match"
                description="Try another search or clear the filters."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            }
          />
        </div>
        {isAdmin && (
          <InvitesSection
            links={links}
            onLink={addLink}
            onInvite={() => setInviteParam("1")}
          />
        )}
      </div>

      {isAdmin && (
        <InviteDialog
          open={inviteParam === "1"}
          onOpenChange={(open) => setInviteParam(open ? "1" : "")}
          onCreated={addLink}
        />
      )}
      <MemberDialog
        member={openMember}
        team={team ?? []}
        viewerId={viewer._id}
        isAdmin={isAdmin}
        onOpenChange={(open) => !open && setMemberParam("")}
      />
    </Page>
  );
}
