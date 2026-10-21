import type { Metadata } from "next";
import ReviewGapPage from "@/features/prospecting/review-gap-page";

export const metadata: Metadata = {
  title: { absolute: "How far behind is your listing? · Hypedrive" },
  description:
    "Compare your Amazon, Flipkart, Nykaa or Myntra listing's ratings with the leaders in its category.",
};

export default function Page() {
  return <ReviewGapPage />;
}
