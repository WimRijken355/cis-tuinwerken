import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tuinwerken Cis",
    template: "%s · Tuinwerken Cis",
  },
  description: "Planning, urenregistratie en facturatie voor Tuinwerken Cis",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Voorkomt ongewenst inzoomen op formuliervelden op iOS.
  maximumScale: 1,
  themeColor: "#2f662f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
