import type { Metadata } from "next";
import "./globals.css";
import "./quant-firm.css";

export const metadata: Metadata = {
  title: "GPT Forex Manager | Quant Firm OS",
  description: "Système de recherche quantitative, de gestion du risque et de paper trading assisté par agents OpenAI."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr-CA">
      <body>{children}</body>
    </html>
  );
}
