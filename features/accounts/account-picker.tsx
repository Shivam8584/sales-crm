"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import OptionPicker, { type Option } from "@/components/fields/option-picker";
import AccountLogo from "./account-logo";

type AccountPickerProps = {
  value: string | null;
  currentName?: string | null;
  onChange: (accountId: string | null) => void;
  className?: string;
  placeholder?: string;
};

export default function AccountPicker({
  value,
  currentName,
  onChange,
  className,
  placeholder = "No account",
}: AccountPickerProps) {
  const accounts = useQuery(api.accounts.list, {});
  const options: Option[] = (accounts ?? []).map((account) => ({
    value: account._id,
    label: account.name,
    hint: account.domain ?? undefined,
    icon: <AccountLogo account={account} size="xs" />,
  }));
  if (
    value &&
    currentName &&
    !options.some((option) => option.value === value)
  ) {
    options.unshift({
      value,
      label: currentName,
      hint: undefined,
      icon: <AccountLogo account={{ name: currentName }} size="xs" />,
    });
  }

  return (
    <OptionPicker
      value={value}
      options={options}
      onChange={onChange}
      label="Account"
      placeholder={placeholder}
      searchPlaceholder="Search accounts…"
      clearLabel="Remove account"
      className={className}
    />
  );
}
