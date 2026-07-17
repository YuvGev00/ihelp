import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";

// Assistant: a Hebrew-native family with a full weight range. next/font
// downloads and self-hosts the files at build time — no runtime CDN call
// (keeps the app self-contained, arch §5).
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-assistant",
});

export const metadata: Metadata = {
  title: "iHelp — מבקשים עזרה, העוזרים מגיעים אליכם",
  description:
    "מפרסמים בקשת עזרה, ועוזרים מאומתים בסביבה מציעים סיוע — בתשלום או בהתנדבות.",
};

/**
 * Root layout is intentionally minimal: html direction + font only.
 * It reads NO cookies, so static routes (/, /emergency) stay static;
 * the session-aware nav lives in the (app) group layout.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <body className="font-sans antialiased bg-canvas text-ink min-h-screen">
        {children}
      </body>
    </html>
  );
}
