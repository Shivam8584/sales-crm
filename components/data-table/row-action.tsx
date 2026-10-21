"use client";

import type { ComponentType, SVGProps } from "react";
import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";

type RowActionProps = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  onClick: () => void;
  shortcut?: string;
  disabled?: boolean;
};

/** Icon button for `DataTable`'s `rowActions`; never triggers the row's own navigation. */
export default function RowAction({
  label,
  icon: Icon,
  onClick,
  shortcut,
  disabled,
}: RowActionProps) {
  return (
    <Tooltip content={label} shortcut={shortcut} side="top">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        <Icon aria-hidden className="size-3.5" />
      </Button>
    </Tooltip>
  );
}
