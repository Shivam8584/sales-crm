"use client";

import { useMemo, type ReactNode } from "react";
import Avatar from "@/components/_ui/avatar";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import DataTable from "@/components/data-table/data-table";
import type {
  Column,
  FooterStat,
  RowMenuItem,
  SortState,
} from "@/components/data-table/types";
import OptionPicker from "@/components/fields/option-picker";
import { PageStatus } from "@/components/shell/page";
import { ROLES, type Role } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { dateTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import UserIcon from "@/public/assets/icons/kanban/user-03.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import CheckIcon from "@/public/assets/icons/check-circle.svg";
import { ROLE_OPTIONS, ROLE_TONE } from "./roles";
import {
  lockReason,
  useMemberActions,
  type TeamMember,
} from "./use-member-actions";

// Optimistic updates re-render synchronously inside a menu click, which detaches
// the menu before the row's click handler checks it and opens the row.
const later = (action: () => void) => () => queueMicrotask(action);

type MembersTableProps = {
  members: TeamMember[] | undefined;
  team: TeamMember[];
  viewerId: TeamMember["_id"];
  isAdmin: boolean;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  memberHref: (member: TeamMember) => string;
  footer: FooterStat[];
  empty: ReactNode;
};

export default function MembersTable({
  members,
  team,
  viewerId,
  isAdmin,
  sort,
  onSortChange,
  memberHref,
  footer,
  empty,
}: MembersTableProps) {
  const { setRole, setStatus } = useMemberActions();

  const columns = useMemo<Column<TeamMember>[]>(
    () => [
      {
        id: "name",
        header: "Member",
        width: "minmax(13rem,2fr)",
        sortValue: (row) => row.name,
        cell: (row) => (
          <>
            <Avatar
              name={row.name}
              size="sm"
              className={cn(row.status !== "active" && "opacity-50")}
            />
            <span
              title={row.name}
              className={cn(
                "truncate",
                row.status !== "active" && "text-fg-tertiary",
              )}
            >
              {row.name}
            </span>
            {row._id === viewerId && (
              <Tag size="xs" className="font-normal">
                You
              </Tag>
            )}
          </>
        ),
      },
      {
        id: "email",
        header: "Email",
        width: "minmax(12rem,2fr)",
        minViewport: 900,
        sortValue: (row) => row.email,
        cell: (row) => (
          <span className="text-fg-secondary truncate" title={row.email}>
            {row.email}
          </span>
        ),
      },
      {
        id: "role",
        header: "Role",
        width: "8.5rem",
        sortValue: (row) => ROLES.indexOf(row.role),
        cell: (row) => (
          <RoleCell
            member={row}
            editable={isAdmin}
            locked={lockReason(row, viewerId, team)}
            onChange={(role) => void setRole(row, role)}
          />
        ),
      },
      {
        id: "joined",
        header: "Joined",
        width: "7.5rem",
        minViewport: 1000,
        defaultDir: "desc",
        sortValue: (row) => row.joinedAt,
        cell: (row) => (
          <Tooltip content={dateTime(row.joinedAt)}>
            <span className="text-fg-secondary pointer-events-auto truncate tabular-nums">
              {shortDate(row.joinedAt)}
            </span>
          </Tooltip>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: "8.5rem",
        sortValue: (row) => row.status,
        cell: (row) => <StatusTag status={row.status} />,
      },
    ],
    [isAdmin, viewerId, team, setRole],
  );

  function rowMenu(row: TeamMember): (RowMenuItem | false)[] {
    if (!isAdmin || row._id === viewerId) return [];
    const locked = Boolean(lockReason(row, viewerId, team));
    const active = row.status === "active";
    return [
      ...ROLES.filter((role) => role !== row.role).map((role) => ({
        label: `Make ${ROLE_LABEL[role].toLowerCase()}`,
        icon: UserIcon,
        disabled: locked,
        onSelect: later(() => void setRole(row, role)),
      })),
      active
        ? {
            label: "Deactivate",
            icon: TrashIcon,
            tone: "danger" as const,
            disabled: locked,
            onSelect: later(() => void setStatus(row, "deactivated")),
          }
        : {
            label: "Reactivate",
            icon: CheckIcon,
            onSelect: later(() => void setStatus(row, "active")),
          },
    ];
  }

  return (
    <DataTable
      label="Members"
      columns={columns}
      rows={members}
      getId={(row) => row._id}
      getHref={memberHref}
      getLabel={(row) => row.name}
      sort={sort}
      onSortChange={onSortChange}
      rowMenu={rowMenu}
      footer={footer}
      renderCard={(row) => (
        <span className="flex items-center gap-3">
          <Avatar
            name={row.name}
            size="lg"
            className={cn(row.status !== "active" && "opacity-50")}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="lead-style flex min-w-0 items-center gap-1.5 font-medium">
              <span className="truncate">{row.name}</span>
              {row._id === viewerId && (
                <Tag size="xs" className="font-normal">
                  You
                </Tag>
              )}
            </span>
            <span className="caption-style text-fg-tertiary truncate">
              {row.email}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            <Tag tone={ROLE_TONE[row.role]} size="xs">
              {ROLE_LABEL[row.role]}
            </Tag>
            {row.status !== "active" && <StatusTag status={row.status} />}
          </span>
        </span>
      )}
      empty={empty}
    />
  );
}

function RoleCell({
  member,
  editable,
  locked,
  onChange,
}: {
  member: TeamMember;
  editable: boolean;
  locked: string | null;
  onChange: (role: Role) => void;
}) {
  const tag = (
    <Tag tone={ROLE_TONE[member.role]} size="sm">
      {ROLE_LABEL[member.role]}
    </Tag>
  );
  if (!editable) return tag;
  if (locked) {
    return (
      <Tooltip content={locked}>
        <span
          tabIndex={0}
          className="focus-visible:ring-ring pointer-events-auto rounded-full outline-none focus-visible:ring-2"
        >
          {tag}
        </span>
      </Tooltip>
    );
  }
  return (
    <OptionPicker
      value={member.role}
      label={`Role for ${member.name}`}
      options={ROLE_OPTIONS}
      onChange={(role) => role && onChange(role as Role)}
      className="group/role gap-1"
    >
      {tag}
      <ChevronDownIcon
        aria-hidden
        className="text-fg-tertiary size-2.5 opacity-0 transition-opacity group-hover/role:opacity-100 group-data-[state=open]/role:opacity-100"
      />
    </OptionPicker>
  );
}

export function StatusTag({ status }: { status: TeamMember["status"] }) {
  return status === "active" ? (
    <PageStatus>Active</PageStatus>
  ) : (
    <PageStatus tone="neutral">Deactivated</PageStatus>
  );
}
