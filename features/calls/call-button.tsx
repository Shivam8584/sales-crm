"use client";

import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import { formatPhone } from "@/lib/domain/normalize";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import { useDialer, type Dial } from "./use-dialer";

export default function CallButton(props: Dial) {
  const { dial, dialog } = useDialer();
  return (
    <>
      <Tooltip content={`Call ${formatPhone(props.phone)}`}>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Call ${props.name}`}
          onClick={() => dial(props)}
        >
          <PhoneCallIcon aria-hidden className="size-3" />
        </Button>
      </Tooltip>
      {dialog}
    </>
  );
}
