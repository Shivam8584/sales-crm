import type { Metadata } from "next";
import Button from "@/components/_ui/button";
import AuthCard from "@/features/auth/auth-card";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <AuthCard
      title="This page doesn't exist"
      description="The link may be broken, or the record was deleted."
    >
      <Button href="/" variant="primary" size="md" className="w-full">
        Go to Today
      </Button>
    </AuthCard>
  );
}
