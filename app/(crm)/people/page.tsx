import { Suspense } from "react";
import PeoplePage from "@/features/people/people-page";

export const metadata = { title: "People" };

export default function Page() {
  return (
    <Suspense>
      <PeoplePage />
    </Suspense>
  );
}
