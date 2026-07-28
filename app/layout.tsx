import type { Metadata } from "next";
import "./globals.css";
import "./quant-firm.css";
import "./data-quality.css";
import "./market-regime.css";
import "./alpha-research.css";
import "./backtest-auditor.css";

export const metadata: Metadata = {
  title: "GPT Forex Manager | Quant Firm OS",
  description: "Système de recherche quantitative, de gestion du risque et de paper trading assisté par agents OpenAI."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr-CA">
      <body>
        {children}
        <a className="global-director-link" href="/directeur" aria-label="Ouvrir la chaîne d’agents quantitatifs">
          Agents 02 → 03 → 04 → 05 → 01
        </a>
      </body>
    </html>
  );
}
