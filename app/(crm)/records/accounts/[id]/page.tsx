import type { Id } from "@/convex/_generated/dataModel";
import AccountPage from "@/features/accounts/account-page";

export const metadata = { title: "Account" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AccountPage id={id as Id<"accounts">} />;
}
