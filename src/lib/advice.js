// Savings guidance engine: deterministic, CA-style checks over accounts,
// cards, loans and transactions. Every tip is quantified in rupees where
// possible. Returns [{level: 'warn'|'info'|'good', title, detail}].

import { detectBounces, detectRecurring, averageBalance } from './analysis.js';
import { inr } from './parsers/common.js';

const INCOME_EXCLUDE = new Set(['Investor Tranche In', 'Self Transfer', 'Refund / Reversal']);

function monthKey(date) {
  return date.slice(0, 7);
}

// Card outstanding from imported transactions: spends (debits) minus
// payments/refunds (credits). Manual override wins when set on the account.
export function cardOutstanding(transactions, account) {
  if (account.outstanding != null && account.outstanding !== '') return Number(account.outstanding);
  let out = 0;
  for (const t of transactions) {
    if (t.accountId !== account.id) continue;
    out += t.direction === 'debit' ? t.amount : -t.amount;
  }
  return Math.max(0, out);
}

// Average monthly personal income proxy: credits excluding tranches/self
// transfers over the months that have any data (up to last 3).
export function avgMonthlyIncome(transactions) {
  const byMonth = {};
  for (const t of transactions) {
    if (t.direction !== 'credit' || INCOME_EXCLUDE.has(t.head)) continue;
    const m = monthKey(t.date);
    byMonth[m] = (byMonth[m] || 0) + t.amount;
  }
  const months = Object.keys(byMonth).sort().reverse().slice(0, 3);
  if (!months.length) return null;
  return months.reduce((a, m) => a + byMonth[m], 0) / months.length;
}

export function computeAdvice({ accounts, transactions, loans }, today = new Date()) {
  const advice = [];
  const push = (level, title, detail) => advice.push({ level, title, detail });

  const cards = accounts.filter((a) => a.type === 'card');
  const banks = accounts.filter((a) => a.type === 'bank');

  // ---- Cards ----
  let totalCardOut = 0;
  for (const card of cards) {
    const out = cardOutstanding(transactions, card);
    totalCardOut += out;
    const limit = Number(card.limit) || 0;
    if (limit > 0) {
      const util = out / limit;
      if (util >= 0.9) {
        push('warn', `${card.label}: card nearly maxed (${Math.round(util * 100)}%)`,
          `Outstanding ${inr(out)} of ${inr(limit)} limit. Above 90% utilisation badly hurts your credit score and risks over-limit fees — pay it down first.`);
      } else if (util >= 0.3) {
        push('warn', `${card.label}: utilisation ${Math.round(util * 100)}%`,
          `Outstanding ${inr(out)} of ${inr(limit)} limit. Keeping utilisation under 30% protects your credit score; consider paying ${inr(out - 0.3 * limit)} early.`);
      }
    }
    if (card.dueDay) {
      const day = today.getDate();
      const due = Number(card.dueDay);
      const daysToDue = (due - day + 31) % 31;
      if (out > 0 && daysToDue <= 5) {
        push('warn', `${card.label}: bill due in ~${daysToDue} day${daysToDue === 1 ? '' : 's'}`,
          `Pay the FULL outstanding (${inr(out)}), not the minimum due — revolving on a card costs ~40-42% a year, the most expensive money in India.`);
      }
    }
  }

  // ---- Loans ----
  const emiTotal = loans.reduce((a, l) => a + (Number(l.emi) || 0), 0);
  const income = avgMonthlyIncome(transactions);
  if (emiTotal > 0 && income > 0) {
    const foir = emiTotal / income;
    if (foir > 0.5) {
      push('warn', `EMIs eat ${Math.round(foir * 100)}% of your income`,
        `${inr(emiTotal)}/month against ~${inr(income)}/month income. Above 50% FOIR most lenders stop lending to you; prioritise closing the smallest or costliest loan.`);
    } else if (foir > 0.4) {
      push('info', `EMI load at ${Math.round(foir * 100)}% of income`,
        `${inr(emiTotal)}/month vs ~${inr(income)}/month income. Under 40% is the comfort zone CAs and lenders use — you're slightly over.`);
    } else {
      push('good', `EMI load healthy (${Math.round(foir * 100)}% of income)`,
        `${inr(emiTotal)}/month against ~${inr(income)}/month income — within the sub-40% comfort zone.`);
    }
  }

  const idle = banks
    .map((a) => averageBalance(transactions, a.id, 30))
    .filter(Boolean)
    .reduce((a, b) => a + b.average, 0);

  for (const l of loans) {
    const rate = Number(l.rate) || 0;
    const out = Number(l.outstanding) || 0;
    if (rate >= 14 && out > 0) {
      push('warn', `${l.lender}: ${rate}% is expensive debt`,
        `Outstanding ${inr(out)} costs ~${inr((out * rate) / 100)}/year in interest. ${idle > 3 * (Number(l.emi) || 0) && idle > 0 ? `You hold ~${inr(idle)} average idle balance — part-prepaying this loan is likely your best "investment".` : 'Clear this before any discretionary spending.'}`);
    }
  }

  // ---- Charges being leaked ----
  const bounces = detectBounces(transactions);
  if (bounces.count > 0) {
    push('warn', `${inr(bounces.totalAmount)} lost to bounce/return charges`,
      `${bounces.count} cheque/NACH/ECS return entries. Keep a buffer in the EMI account or move mandates to the account with the fattest balance — this is pure waste.`);
  }
  const bankCharges = transactions.filter((t) => t.head === 'Bank Charges' && t.direction === 'debit');
  const chargesTotal = bankCharges.reduce((a, t) => a + t.amount, 0);
  if (chargesTotal > 500) {
    push('info', `${inr(chargesTotal)} paid in bank charges`,
      `AMB penalties, SMS and processing fees add up. Ask each bank to switch you to a zero-AMB or salary variant; most waive fees for the asking.`);
  }

  // ---- Subscriptions / recurring ----
  const recurring = detectRecurring(transactions);
  const subs = recurring.filter((r) => r.avgAmount <= 5000 && r.months >= 2);
  if (subs.length >= 3) {
    const monthly = subs.reduce((a, s) => a + s.avgAmount, 0);
    push('info', `${subs.length} recurring merchants ≈ ${inr(monthly)}/month`,
      `That's ~${inr(monthly * 12)}/year on repeat spends (${subs.slice(0, 4).map((s) => s.token).join(', ')}…). Cancel the ones you wouldn't re-subscribe to today.`);
  }

  // ---- Savings rate, last full month ----
  const months = [...new Set(transactions.map((t) => monthKey(t.date)))].sort().reverse();
  if (months.length >= 1 && income > 0) {
    const m = months[0];
    const spend = transactions
      .filter((t) => monthKey(t.date) === m && t.direction === 'debit' && !['Self Transfer', 'Manish Transfer', 'Card Bill Payment'].includes(t.head))
      .reduce((a, t) => a + t.amount, 0);
    const rate = (income - spend) / income;
    if (rate < 0) {
      push('warn', `Spending exceeded income in ${m}`,
        `Out ${inr(spend)} vs ~${inr(income)} income — the gap is coming from balances or investor money. Investor funds spent on personal heads is the one thing that must never happen; check the bifurcation.`);
    } else if (rate < 0.2) {
      push('info', `Savings rate ${Math.round(rate * 100)}% in ${m}`,
        `Saved ${inr(income - spend)} of ~${inr(income)}. A 20-30% target is the usual CA guidance; automate a transfer on income day so saving happens first.`);
    } else {
      push('good', `Savings rate ${Math.round(rate * 100)}% in ${m}`,
        `Saved ${inr(income - spend)} of ~${inr(income)} — solid. Sweep the surplus somewhere it earns.`);
    }
  }

  // ---- Idle money ----
  const monthlySpendAvg = (() => {
    const byMonth = {};
    for (const t of transactions) {
      if (t.direction !== 'debit') continue;
      byMonth[monthKey(t.date)] = (byMonth[monthKey(t.date)] || 0) + t.amount;
    }
    const ms = Object.values(byMonth);
    return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
  })();
  if (idle > 0 && monthlySpendAvg > 0 && idle > 2 * monthlySpendAvg && totalCardOut === 0) {
    const excess = idle - 2 * monthlySpendAvg;
    push('info', `~${inr(excess)} sitting idle in savings`,
      `Average balance ${inr(idle)} is over 2× your monthly outflow. A sweep-in FD earns ~7% vs ~3% in savings — roughly ${inr(excess * 0.04)}/year extra for zero effort. (Keep investor tranche money separate and liquid.)`);
  }

  // ---- Cash discipline ----
  const cashOut = transactions.filter((t) => t.head === 'Cash Withdrawal');
  const cashTotal = cashOut.reduce((a, t) => a + t.amount, 0);
  const debitTotal = transactions.filter((t) => t.direction === 'debit').reduce((a, t) => a + t.amount, 0);
  if (debitTotal > 0 && cashTotal / debitTotal > 0.15) {
    push('info', `${Math.round((cashTotal / debitTotal) * 100)}% of outflow is cash withdrawals`,
      `${inr(cashTotal)} withdrawn as cash is invisible to tagging — log where it went as manual entries (especially anything to Manish), or your business/personal split understates spending.`);
  }

  if (!advice.length) {
    push('good', 'Nothing to flag yet', 'Import more statements, and add your cards and loans so there is something to analyse.');
  }
  const order = { warn: 0, info: 1, good: 2 };
  return advice.sort((a, b) => order[a.level] - order[b.level]);
}
