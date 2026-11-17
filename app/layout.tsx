import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { BuildVersion } from "@/components/BuildVersion";
import { PushNotifications } from "@/components/PushNotifications";
import {
  ThemeProvider,
  themeBootScript,
} from "@/components/theme-provider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YASL",
  applicationName: "YASL",
  description: "Yet Another Shopping List",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "YASL",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c98e70" },
    { media: "(prefers-color-scheme: dark)", color: "#241f1d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>{children}</ThemeProvider>
        <PushNotifications />
        <BuildVersion />
      </body>
    </html>
  );
}
