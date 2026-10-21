import { Suspense } from "react";
import TeamPage from "@/features/team/team-page";

export const metadata = { title: "Team" };

export default function Page() {
  return (
    <Suspense>
      <TeamPage />
    </Suspense>
  );
}
