// Bank alert email / SMS parser.
//
// HDFC, IndusInd and Kotak all send per-transaction alerts ("Rs.449.00
// debited from a/c **1234 on 01-07-26 to VPA swiggy@ybl…"). Paste one or
// many of them (email bodies or SMS texts) and this turns each into a
// transaction — the daily-ingestion path used by open-source alert-parsing
// trackers, done locally instead of via a mail server.

import { parseIndianDate, parseAmount } from './common.js';

const AMOUNT_ACTION_RE = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:is\s+|has\s+been\s+|was\s+|)(debited|credited|spent|withdrawn|received|paid|deducted)/i;
const DATE_RE = /\bon\s+(\d{1,2}[-/. ](?:[A-Za-z]{3}|\d{1,2})[-/. ]\d{2,4})/i;
const LAST4_RE = /(?:a\/c|acct|account|card)\s*(?:no\.?\s*)?(?:ending\s*)?[Xx*]*(\d{4})/i;
const COUNTERPARTY_RE = /\b(?:to|at|towards|by|from)\s+(?:VPA\s+)?([A-Za-z0-9@._\- ]{3,50}?)(?=\s+on\s|\s+ref|\s+\(|\s+upi\b|\.\s|\.$|,|;|$)/i;

const CREDIT_ACTIONS = new Set(['credited', 'received']);

export function parseAlerts(text) {
  // Treat each line (or sentence, for pasted email bodies) as a candidate alert.
  const chunks = text
    .split(/\n+/)
    .flatMap((l) => (l.length > 250 ? l.split(/(?<=\.)\s+(?=Rs|INR|₹)/i) : [l]))
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  let skipped = 0;
  for (const chunk of chunks) {
    const m = chunk.match(AMOUNT_ACTION_RE);
    if (!m) continue;
    const amount = parseAmount(m[1]);
    if (!amount || amount < 0) continue;

    const dateM = chunk.match(DATE_RE);
    const date = dateM ? parseIndianDate(dateM[1]) : null;
    if (!date) {
      skipped++;
      continue;
    }

    const direction = CREDIT_ACTIONS.has(m[2].toLowerCase()) ? 'credit' : 'debit';
    const last4 = chunk.match(LAST4_RE)?.[1] || null;
    const cp = chunk.match(COUNTERPARTY_RE)?.[1]?.trim();
    const narration = (cp && cp.length >= 3 ? cp : chunk.slice(0, 80)).replace(/\s+/g, ' ');

    out.push({ date, narration, amount: Math.abs(amount), direction, last4 });
  }
  return { transactions: out, skippedNoDate: skipped };
}
