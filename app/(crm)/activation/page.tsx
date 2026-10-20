import { Suspense } from "react";
import ActivationPage from "@/features/activation/activation-page";

export const metadata = { title: "Activation" };

export default function Page() {
  return (
    <Suspense>
      <ActivationPage />
    </Suspense>
  );
}
