import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

const dmsans = DM_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-dmsans", display: "swap" });
const manrope = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-manrope", display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Nourish", template: "%s · Nourish" },
  description: "Osobní jídelní plán, chytrá lednice, meal prep a nákup bez administrativy.",
  applicationName: "Nourish",
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: { capable: true, title: "Nourish", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/192", type: "image/png" }], apple: [{ url: "/icons/180", sizes: "180x180", type: "image/png" }] },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#111210",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${dmsans.variable} ${manrope.variable}`}>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
