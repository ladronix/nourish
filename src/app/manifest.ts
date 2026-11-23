import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Nourish — osobní výživa",
    short_name: "Nourish",
    description: "Jídelní plán, lednice, meal prep a nákup bez administrativy.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f2ed",
    theme_color: "#111210",
    lang: "cs",
    orientation: "portrait",
    categories: ["health", "food", "lifestyle"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dnes", url: "/" },
      { name: "Nákup", url: "/shopping" },
      { name: "Lednice", url: "/fridge" },
    ],
  };
}
