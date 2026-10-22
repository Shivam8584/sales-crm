import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import ScrollToTop from "@/components/_common/scroll-to-top";
import Toaster from "@/components/_common/toaster";
import { TooltipProvider } from "@/components/_ui/tooltip";
import MotionProvider from "@/components/_common/motion-provider";
import ConvexProvider from "@/components/_common/convex-provider";
import RegisterSw from "@/features/pwa/register-sw";
import { THEME_SCRIPT } from "@/lib/theme-script";
import { SIDEBAR_WIDTH_SCRIPT } from "@/lib/sidebar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  axes: ["opsz"],
});

const interDisplay = localFont({
  src: "../fonts/InterDisplay-Medium.woff2",
  weight: "500",
  variable: "--font-inter-display",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_IN" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1012" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${interDisplay.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `history.scrollRestoration="manual";${THEME_SCRIPT};${SIDEBAR_WIDTH_SCRIPT}`,
          }}
        />
      </head>
      <body className="relative z-0 font-sans antialiased">
        <ConvexProvider>
          <MotionProvider>
            <TooltipProvider>
              <ScrollToTop />
              {children}
              <Toaster />
              <RegisterSw />
            </TooltipProvider>
          </MotionProvider>
        </ConvexProvider>
      </body>
    </html>
  );
}
