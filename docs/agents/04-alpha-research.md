# Agent 04 — Alpha Research Agent

## Mission

L'Alpha Research Agent transforme les familles de stratégies autorisées par l'Agent 03 en hypothèses falsifiables. Il prépare des spécifications de backtest, mais ne valide aucune performance et ne produit aucun signal.

## Position dans la chaîne

```text
Agent 02 — Data Quality Agent
      ↓
Agent 03 — Market Regime Agent
      ↓
Agent 04 — Alpha Research Agent
      ↓
Agent 01 — Directeur quantitatif
      ↓
Backtest Auditor + Compliance Journal
```

## Enveloppe déterministe

L'application impose :

- trois hypothèses maximum;
- six paramètres libres maximum par hypothèse;
- au moins 30 % des données strictement hors échantillon;
- au moins 50 transactions simulées avant évaluation;
- séparation chronologique entraînement, validation et test;
- validation walk-forward;
- coûts, spread et glissement réalistes;
- analyse de sensibilité;
- stabilité dans plusieurs sous-périodes;
- correction des essais multiples et du biais de sélection;
- audit indépendant par le Backtest Auditor.

Le nombre minimal d'observations dépend de l'intervalle étudié. L'échantillon actuellement affiché peut servir à rédiger une spécification, mais il ne constitue pas automatiquement un historique suffisant pour conclure à une performance.

## Sortie de chaque hypothèse

- identifiant versionnable;
- famille autorisée;
- titre;
- biais directionnel de recherche;
- intuition économique;
- conditions de marché nécessaires;
- condition candidate à tester;
- condition de sortie à tester;
- variables utilisées;
- horizon de détention étudié;
- mesure cible;
- critères d'invalidation;
- modes d'échec attendus;
- données requises;
- tests de robustesse;
- statut permanent `SPECIFICATION_ONLY`.

## Restrictions

1. Aucune hypothèse ne peut utiliser une famille exclue par l'Agent 03.
2. Aucune hypothèse ne peut contenir un ordre actuel ou un prix d'exécution.
3. Aucun rendement, taux de réussite ou avantage n'est présumé.
4. Les données synthétiques permettent seulement de tester le pipeline.
5. Une hypothèse ne peut passer directement au portefeuille, au risque ou à l'exécution.
6. La prochaine porte obligatoire est le Backtest Auditor.
7. `tradeDecision` demeure toujours `NO_TRADE_DECISION`.

## Variables OpenAI Platform

```env
OPENAI_PROMPT_ALPHA_RESEARCH_ID=pmpt_...
OPENAI_PROMPT_ALPHA_RESEARCH_VERSION=
```

Sans prompt stocké, l'agent utilise les instructions versionnées dans le dépôt.
