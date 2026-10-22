import { Suspense } from "react";
import PlaybookPage from "@/features/playbook/playbook-page";

export const metadata = { title: "Playbook" };

export default function Page() {
  return (
    <Suspense>
      <PlaybookPage />
    </Suspense>
  );
}
