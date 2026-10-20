import { Suspense } from "react";
import DealsPage from "@/features/deals/deals-page";

export const metadata = { title: "Deals" };

export default function Page() {
  return (
    <Suspense>
      <DealsPage />
    </Suspense>
  );
}
