"use client";

import ErrorCard from "@/features/auth/error-card";
import "./globals.css";

export default function GlobalError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong · Hypedrive CRM</title>
      </head>
      <body className="font-sans antialiased">
        <ErrorCard {...props} />
      </body>
    </html>
  );
}
