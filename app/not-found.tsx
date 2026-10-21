import type { Metadata } from "next";
import Button from "@/components/_ui/button";
import AuthCard from "@/features/auth/auth-card";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <AuthCard
      title="This page doesn't exist"
      description="The link may be broken, or the record was deleted or moved."
    >
      <div className="border-border border-t px-6 py-5">
        <Button href="/" variant="primary" size="md" className="w-full">
          Go to Today
        </Button>
      </div>
    </AuthCard>
  );
}
