"use client";

import Button from "@/components/_ui/button";

export default function ReloadButton() {
  return (
    <Button
      variant="primary"
      size="md"
      className="w-full"
      onClick={() => location.reload()}
    >
      Try again
    </Button>
  );
}
