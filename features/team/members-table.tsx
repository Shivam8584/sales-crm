"use client";

import { useMemo, type ReactNode } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import OptionPicker from "@/components/fields/option-picker";
import { ROLES, type Role } from "@/lib/domain/enums";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import { ROLE_OPTIONS } from "./roles";
import {
  lockReason,
  useMemberActions,
  type TeamMember,
} from "./use-member-actions";

type MembersTableProps = {
  members: TeamMember[] | undefined;
  team: TeamMember[];
  viewerId: TeamMember["_id"];
  isAdmin: boolean;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  memberHref: (member: TeamMember) => string;
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
  empty,
}: MembersTableProps) {
  const { setRole, setStatus } = useMemberActions();

  const columns = useMemo<Column<TeamMember>[]>(() => {
    const list: Column<TeamMember>[] = [
      {
        id: "name",
        header: "Name",
        width: "minmax(13rem,2fr)",
        sortValue: (row) => row.name,
        cell: (row) => (
          <>
            <Avatar
              name={row.name}
              size="md"
              className={cn(row.status !== "active" && "opacity-50")}
            />
            <span
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
          <span className="text-fg-secondary truncate">{row.email}</span>
        ),
      },
      {
        id: "role",
        header: "Role",
        width: "8.5rem",
        sortValue: (row) => ROLES.indexOf(row.role),
        cell: (row) => {
          const locked = lockReason(row, viewerId, team);
          if (!isAdmin || locked) {
            const label = <span>{ROLE_LABEL[row.role]}</span>;
            return isAdmin && locked ? (
              <Tooltip content={locked}>
                <span
                  tabIndex={0}
                  className="focus-visible:ring-ring pointer-events-auto rounded-sm outline-none focus-visible:ring-2"
                >
                  {label}
                </span>
              </Tooltip>
            ) : (
              label
            );
          }
          return (
            <OptionPicker
              value={row.role}
              label={`Role for ${row.name}`}
              options={ROLE_OPTIONS}
              onChange={(role) => role && void setRole(row, role as Role)}
              className="group/role"
            >
              {ROLE_LABEL[row.role]}
              <ChevronDownIcon
                aria-hidden
                className="text-fg-tertiary size-2.5 opacity-0 transition-opacity group-hover/role:opacity-100 group-data-[state=open]/role:opacity-100"
              />
            </OptionPicker>
          );
        },
      },
      {
        id: "joined",
        header: "Joined",
        width: "7.5rem",
        minViewport: 1000,
        defaultDir: "desc",
        sortValue: (row) => row.joinedAt,
        cell: (row) => (
          <span className="text-fg-secondary">{shortDate(row.joinedAt)}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: "8rem",
        sortValue: (row) => row.status,
        cell: (row) => <StatusTag status={row.status} />,
      },
    ];
    if (isAdmin) {
      list.push({
        id: "actions",
        header: "",
        width: "3.5rem",
        align: "end",
        cell: (row) =>
          row._id === viewerId ? null : (
            <MemberMenu
              member={row}
              locked={lockReason(row, viewerId, team)}
              onStatus={(status) => void setStatus(row, status)}
            />
          ),
      });
    }
    return list;
  }, [isAdmin, viewerId, team, setRole, setStatus]);

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
              {ROLE_LABEL[row.role]} · {row.email}
            </span>
          </span>
          {row.status !== "active" && <StatusTag status={row.status} />}
        </span>
      )}
      empty={empty}
    />
  );
}

export function StatusTag({ status }: { status: TeamMember["status"] }) {
  return status === "active" ? (
    <Tag tone="green" size="sm">
      Active
    </Tag>
  ) : (
    <Tag size="sm">Deactivated</Tag>
  );
}

function MemberMenu({
  member,
  locked,
  onStatus,
}: {
  member: TeamMember;
  locked: string | null;
  onStatus: (status: TeamMember["status"]) => void;
}) {
  const active = member.status === "active";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${member.name}`}
        >
          <DotsIcon aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-64">
        {active ? (
          <DropdownMenuItem
            disabled={!!locked}
            onSelect={() => onStatus("deactivated")}
            className="text-danger"
          >
            Deactivate
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onStatus("active")}>
            Reactivate
          </DropdownMenuItem>
        )}
        {active && locked && (
          <p className="caption-style text-fg-tertiary px-2 pt-1 pb-1.5 leading-snug">
            {locked}.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
