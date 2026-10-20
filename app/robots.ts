import type { MetadataRoute } from "next";

/** The CRM is an internal tool; the demo form is linked or embedded from the marketing site. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
