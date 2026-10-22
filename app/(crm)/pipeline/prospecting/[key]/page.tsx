import BrandPage from "@/features/prospecting/brand-page";

export const metadata = { title: "Brand" };

export default async function Page({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <BrandPage brandKey={decodeURIComponent(key)} />;
}
