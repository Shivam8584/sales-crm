import { Suspense } from "react";
import InboxPage from "@/features/inbox/inbox-page";

export const metadata = { title: "Inbox" };

export default function Page() {
  return (
    <Suspense>
      <InboxPage />
    </Suspense>
  );
}
