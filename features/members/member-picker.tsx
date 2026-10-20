"use client";

import Avatar from "@/components/_ui/avatar";
import OptionPicker, { type Option } from "@/components/fields/option-picker";
import { useMembers } from "@/hooks/use-viewer";
import { ROLE_LABEL } from "@/lib/domain/labels";

type MemberPickerProps = {
  value: string | null;
  /** Shown while the member list loads and for owners who left the team. */
  currentName?: string | null;
  onChange: (memberId: string) => void;
  label?: string;
  className?: string;
};

export default function MemberPicker({
  value,
  currentName,
  onChange,
  label = "Owner",
  className,
}: MemberPickerProps) {
  const members = useMembers();
  const options: Option[] = (members ?? []).map((member) => ({
    value: member._id,
    label: member.name,
    hint: ROLE_LABEL[member.role],
    icon: <Avatar name={member.name} />,
  }));
  if (
    value &&
    currentName &&
    !options.some((option) => option.value === value)
  ) {
    options.unshift({
      value,
      label: currentName,
      hint: "",
      icon: <Avatar name={currentName} />,
    });
  }

  return (
    <OptionPicker
      value={value}
      options={options}
      onChange={(next) => next && onChange(next)}
      label={label}
      placeholder="No owner"
      searchPlaceholder="Search teammates…"
      className={className}
    />
  );
}
