// CA-style statement analysis: the metrics a practising CA (or a lender's
// underwriter) computes from bank statements — banking turnover, average
// balance, bounces, EMIs, recurring spends. Patterns adopted from
// open-source bank-statement analysers and underwriting tools.

import { guessMerchantToken } from './categorize.js';

const DAY = 86400000;

function monthKey(date) {
  return date.slice(0, 7);
}

// Monthly banking turnover: total credits & debits per month (all accounts
// combined), excluding self transfers between own accounts.
export function monthlyTurnover(transactions) {
  const byMonth = {};
  for (const t of transactions) {
    if (t.head === 'Self Transfer') continue;
    const m = monthKey(t.date);
    if (!byMonth[m]) byMonth[m] = { month: m, credits: 0, debits: 0 };
    if (t.direction === 'credit') byMonth[m].credits += t.amount;
    else byMonth[m].debits += t.amount;
  }
  return Object.values(byMonth)
    .map((r) => ({ ...r, net: r.credits - r.debits }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));
}

// Average end-of-day balance over the trailing N days, per account.
// Uses the running-balance column captured on import; the balance after the
// last transaction of a day is that day's EOD balance, carried forward
// through days with no transactions.
export function averageBalance(transactions, accountId, days) {
  const txns = transactions
    .filter((t) => t.accountId === accountId && t.balance != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!txns.length) return null;

  const eod = new Map(); // date -> last balance seen that day
  for (const t of txns) eod.set(t.date, t.balance);

  const last = new Date(txns[txns.length - 1].date + 'T00:00:00Z');
  const first = new Date(txns[0].date + 'T00:00:00Z');
  const span = Math.min(days, Math.round((last - first) / DAY) + 1);

  let sum = 0;
  let counted = 0;
  let carry = null;
  // walk from the first covered day up to the last, remembering the carry
  for (let d = new Date(first); d <= last; d = new Date(d.getTime() + DAY)) {
    const key = d.toISOString().slice(0, 10);
    if (eod.has(key)) carry = eod.get(key);
    const daysFromEnd = Math.round((last - d) / DAY);
    if (carry != null && daysFromEnd < days) {
      sum += carry;
      counted++;
    }
  }
  if (!counted) return null;
  return { average: sum / counted, days: span, coveredDays: counted };
}

// Cheque / ECS / NACH returns and penal charges.
const BOUNCE_RE = /(CHQ\s*RTN|CHEQUE\s*RETURN|RTN\s*CHG|RETURN\s*CHARGES|OW\s*RTN|IW\s*RTN|NACH\s*RTN|ACH\s*RTN|ECS\s*RTN|NACH\s*RETURN|ECS\s*RETURN|BOUNCE|INSUFFICIENT\s*FUND|FUNDS\s*INSUFF|MANDATE\s*(FAIL|REJECT)|UNPAID)/i;

export function detectBounces(transactions) {
  const hits = transactions.filter((t) => BOUNCE_RE.test(t.narration || ''));
  return {
    count: hits.length,
    totalAmount: hits.reduce((a, t) => a + t.amount, 0),
    transactions: hits,
  };
}

// EMI / loan repayments: recurring NACH/ECS/EMI debits, grouped by lender.
const EMI_RE = /(NACH|ECS|ACH\s*D|EMI|LOAN\s*REPAY|LOAN\s*EMI|BAJAJ\s*FIN|HDFC\s*LTD|HDB\s*FIN|TVS\s*CRED|TATA\s*CAP|ADITYA\s*BIRLA\s*FIN|FULLERTON|LIC\s*HFL|CHOLA)/i;

export function detectEmis(transactions) {
  const debits = transactions.filter(
    (t) => t.direction === 'debit' && EMI_RE.test(t.narration || '') && !BOUNCE_RE.test(t.narration || '')
  );
  const byLender = {};
  for (const t of debits) {
    const lender = guessMerchantToken(t.narration) || 'UNKNOWN';
    if (!byLender[lender]) byLender[lender] = { lender, months: new Set(), total: 0, count: 0, amounts: [] };
    const g = byLender[lender];
    g.months.add(monthKey(t.date));
    g.total += t.amount;
    g.count++;
    g.amounts.push(t.amount);
  }
  return Object.values(byLender)
    .map((g) => ({
      lender: g.lender,
      count: g.count,
      months: g.months.size,
      avgAmount: g.total / g.count,
      total: g.total,
    }))
    .sort((a, b) => b.total - a.total);
}

// Repetitive spends: the same merchant appearing in 2+ distinct months.
// These are the prime candidates for "remember" rules and subscriptions review.
export function detectRecurring(transactions) {
  const debits = transactions.filter((t) => t.direction === 'debit');
  const groups = {};
  for (const t of debits) {
    const token = guessMerchantToken(t.narration);
    if (!token || token.length < 4) continue;
    if (!groups[token]) groups[token] = { token, months: new Set(), count: 0, total: 0, heads: {} };
    const g = groups[token];
    g.months.add(monthKey(t.date));
    g.count++;
    g.total += t.amount;
    if (t.head) g.heads[t.head] = (g.heads[t.head] || 0) + 1;
  }
  return Object.values(groups)
    .filter((g) => g.months.size >= 2 && g.count >= 2)
    .map((g) => ({
      token: g.token,
      count: g.count,
      months: g.months.size,
      avgAmount: g.total / g.count,
      total: g.total,
      head: Object.entries(g.heads).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    }))
    .sort((a, b) => b.total - a.total);
}
