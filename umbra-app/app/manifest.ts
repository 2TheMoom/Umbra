import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Umbra — Confidential Agent Payment Gate",
    short_name: "Umbra",
    description:
      "Confidential payment authorization for autonomous agents, built on Zama FHEVM.",
    start_url: "/",
    display: "standalone",
    background_color: "#e9e6df",
    theme_color: "#000000",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  };
}
