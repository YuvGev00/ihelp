import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
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
    <html lang="he" dir="rtl">
      <body
        className={`${heebo.variable} font-sans antialiased bg-stone-50 text-stone-900 min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
