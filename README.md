# Munshi — your personal accountant

A private, browser-only personal accountant built for an Indian founder juggling investor money,
business spends, personal spends, and informal transfers (including cash) with a partner.

Think of it as the daily working file a good CA would keep for you:

- **Accounts linked to your email IDs** — register each main bank account with the email it's tied to.
- **PDF & CSV bank statement import** — statements from any major Indian bank (HDFC, ICICI, Axis,
  SBI, Kotak, …) are parsed **entirely in your browser**; nothing is uploaded anywhere.
- **Auto-tagging with memory** — transactions are tagged under spend heads (Rent, Salaries, SaaS,
  Food, EMI, GST, …) by a rules engine pre-loaded with common Indian merchants. When you tag
  something once and tick *remember*, every future occurrence tags itself.
- **Business vs personal bifurcation** — every spend carries a business/personal scope; the
  dashboard shows the split per month, which is exactly what you need at tax time and for investor
  reporting.
- **Investor tranches** — record committed tranches per investor, link the actual bank credits as
  they land, and see what's still pending.
- **Manish ledger** — upload your exported WhatsApp chat; messages like "sent 50k" / "bhej diya
  25000" / "cash de diya" become claims that are auto-reconciled against bank transactions.
  Whatever doesn't match (usually cash) is flagged as missing paper trail, with a running net
  position between the two of you.
- **Review queue** — a daily 2-minute habit: confirm auto-tags, tag the rest, done.
- **CA Analysis** — the underwriting view a CA or lender computes from statements: monthly banking
  turnover, average balance over 30/90 days (EOD carry-forward from the running-balance column),
  cheque/NACH/ECS bounce detection, EMI & loan-mandate detection grouped by lender, and repetitive
  spend detection.
- **Paste bank alerts** — copy debit/credit alert emails or SMS from HDFC / IndusInd / Kotak and
  paste them in; each becomes a transaction, auto-routed to the right account by last-4 digits.
- **Similarity suggestions** — untagged transactions get a one-click suggested head from the most
  similar transaction you've already tagged (rules → similarity ladder; LLM rung on the roadmap).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ — host anywhere (Netlify/Vercel/GitHub Pages)
```

No backend, no database, no signup. State lives in your browser's localStorage; use
**Accounts → Backup** to download/restore a JSON backup.

## Security stance (read this)

**Never share your internet-banking password with any tool, app, or person — including this one.**
It violates your bank's terms, forfeits RBI fraud protections, and no legitimate accountant needs
it. This app is deliberately designed around safe inputs:

1. **Statement uploads (today)** — PDF/CSV parsed locally in the browser.
2. **Transaction-alert emails (roadmap)** — read-only parsing of bank alert emails from your inbox.
3. **RBI Account Aggregator (roadmap)** — consent-based, read-only, revocable bank feeds via
   licensed AAs (Setu, Finvu, OneMoney). This is the *only* correct way to "link" Indian bank
   accounts.

## Roadmap

- [ ] Gmail ingestion: parse daily transaction-alert emails per linked email ID
- [ ] Account Aggregator integration for automatic feeds
- [ ] LLM-assisted tagging for narrations the rules engine can't classify
- [ ] Monthly PDF report: business vs personal P&L, tranche utilisation, Manish reconciliation
- [ ] Multi-party ledgers (beyond Manish)
- [ ] Optional encrypted sync backend

## Ideas adopted from the open-source ecosystem

Surveyed before/while building; one tool, best ideas from each lineage:

- **Statement analysers** (Banking-Statement-Analyzer, Bank-Statement-Utility, stmtforge): the CA
  Analysis metrics — turnover, average balance, bounces, EMIs.
- **Categorizers** (saumya-pailwan/transaction-categorization, beanborg, tcat, tally): the
  deterministic-rules-first, similarity-second categorization ladder.
- **Alert-email trackers** (passbook, rakshran/expense-tracker, myFinance): read-only alert
  parsing as the safe daily-ingestion path; done here as local paste-parsing.
- **Firefly III / Actual Budget**: rules-engine ergonomics and the local-first stance;
  recurring-transaction surfacing.

## Tech

Vite + React 18, `pdfjs-dist` for client-side PDF text extraction, zero server. PDF parsing infers
debit/credit from running-balance deltas so it works across banks' differing statement layouts.
