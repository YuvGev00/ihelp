import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes iHelp installable ("Add to Home Screen"), launching
 * chromeless in standalone mode with the pine brand color and RTL Hebrew.
 * No service worker is required for installability; this is entirely
 * self-contained (no runtime dependency).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iHelp — מבקשים עזרה, העוזרים מגיעים אליכם",
    short_name: "iHelp",
    description:
      "מפרסמים בקשת עזרה, ועוזרים מאומתים בסביבה מציעים סיוע — בתשלום או בהתנדבות.",
    start_url: "/requests",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#06432f",
    theme_color: "#0d7a5f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
