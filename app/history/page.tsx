export default function HistoryPage() {
  return (
    <main className="container master-container">
      <section className="hero master-hero">
        <div className="card hero-main">
          <span className="badge">Nexus Data Lab</span>
          <span className="badge buy">Supabase Ready</span>
          <h1>History <span>Lab</span></h1>
          <p className="muted">Espace pour importer des chandelles historiques Forex dans Supabase et entraîner l’IA sans consommer Alpha Vantage.</p>
          <div className="warning">La table market_candles est prête. Prochaine étape: formulaire d’import CSV.</div>
        </div>
        <div className="card status-card">
          <h2>Étapes</h2>
          <div className="system-list">
            <div><b>1</b><span>Importer CSV</span></div>
            <div><b>2</b><span>Lire Supabase</span></div>
            <div><b>3</b><span>Backtester</span></div>
            <div><b>4</b><span>Apprendre</span></div>
          </div>
        </div>
      </section>
      <section className="card">
        <h2>Import historique</h2>
        <p className="small">Le formulaire complet sera ajouté ici. Format attendu: time, open, high, low, close, volume optionnel.</p>
        <a className="btn secondary" href="/">Retour dashboard</a>
      </section>
    </main>
  );
}
