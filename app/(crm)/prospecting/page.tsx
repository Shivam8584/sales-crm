import { Suspense } from "react";
import ProspectingPage from "@/features/prospecting/prospecting-page";

export const metadata = { title: "Prospecting" };

export default function Page() {
  return (
    <Suspense>
      <ProspectingPage />
    </Suspense>
  );
}
