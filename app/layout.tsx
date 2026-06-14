import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPT Forex Manager",
  description: "AI assisted Forex paper trading dashboard."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
