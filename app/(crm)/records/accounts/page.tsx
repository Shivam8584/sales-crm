import { Suspense } from "react";
import AccountsPage from "@/features/accounts/accounts-page";

export const metadata = { title: "Accounts" };

export default function Page() {
  return (
    <Suspense>
      <AccountsPage />
    </Suspense>
  );
}
