"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import OptionPicker, { type Option } from "@/components/fields/option-picker";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import AccountLogo from "./account-logo";

type AccountPickerProps = {
  value: string | null;
  currentName?: string | null;
  onChange: (accountId: string | null) => void;
  className?: string;
  placeholder?: string;
};

/** Searches accounts on the server as you type; recently active ones first. */
export default function AccountPicker({
  value,
  currentName,
  onChange,
  className,
  placeholder = "No account",
}: AccountPickerProps) {
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 150);
  const accounts = useQuery(api.accounts.search, {
    search: query,
    selected: value ?? undefined,
  });
  const options: Option[] = (accounts ?? []).map((account) => ({
    value: account._id,
    label: account.name,
    hint: account.domain ?? undefined,
    icon: <AccountLogo account={account} size="xs" />,
  }));
  if (value && currentName && accounts === undefined) {
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
      onSearch={setSearch}
      label="Account"
      placeholder={placeholder}
      searchPlaceholder="Search accounts…"
      clearLabel="Remove account"
      className={className}
    />
  );
}
