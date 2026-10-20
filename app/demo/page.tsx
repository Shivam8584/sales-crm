import type { Metadata } from "next";
import DemoPage from "@/features/demo/demo-page";

export const metadata: Metadata = {
  title: "Book a demo · Hypedrive",
  description:
    "Talk to Hypedrive about verified buyers and creator content for your Amazon, Flipkart and D2C listings.",
  robots: { index: false, follow: false },
};

export default async function Page({ searchParams }: PageProps<"/demo">) {
  const params = await searchParams;
  const theme =
    params.theme === "light" || params.theme === "dark" ? params.theme : null;
  return <DemoPage embed={params.embed === "1"} theme={theme} />;
}
