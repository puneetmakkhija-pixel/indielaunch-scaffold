// Reconcile WhatsApp claims ("bhej diya 50k") against actual bank
// transactions. A claim matches a transaction when the amount is equal and
// the dates are within a few days. Unmatched claims are usually the cash
// handovers — exactly the ones that need a paper trail.

const DAY = 86400000;

function daysBetween(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / DAY;
}

export function autoMatchClaims(claims, transactions, windowDays = 4) {
  const manishTxns = transactions.filter(
    (t) => t.head === 'Manish Transfer' || /manish/i.test(t.narration || '')
  );
  const usedTxns = new Set(claims.map((c) => c.matchedTxnId).filter(Boolean));
  const updates = [];
  for (const claim of claims) {
    if (claim.matchedTxnId || claim.mode === 'cash') continue;
    const wantDirection = claim.direction === 'to_manish' ? 'debit' : 'credit';
    const candidates = manishTxns
      .filter(
        (t) =>
          !usedTxns.has(t.id) &&
          t.direction === wantDirection &&
          Math.abs(t.amount - claim.amount) < 0.01 &&
          daysBetween(t.date, claim.date) <= windowDays
      )
      .sort((a, b) => daysBetween(a.date, claim.date) - daysBetween(b.date, claim.date));
    if (candidates.length) {
      usedTxns.add(candidates[0].id);
      updates.push({ claimId: claim.id, txnId: candidates[0].id });
    }
  }
  return updates;
}

// Net position: positive = Manish owes you (you sent more than you received).
export function manishLedger(claims, transactions) {
  // manishSide marks rows that belong to the Manish ledger even when tagged
  // under another head (e.g. verified client credits tagged Investor Tranche In).
  const bankTxns = transactions.filter((t) => t.head === 'Manish Transfer' || t.manishSide);
  const matchedTxnIds = new Set(claims.map((c) => c.matchedTxnId).filter(Boolean));

  let sent = 0;
  let received = 0;
  const entries = [];

  for (const t of bankTxns) {
    const amt = t.amount;
    if (t.direction === 'debit') sent += amt;
    else received += amt;
    entries.push({
      kind: 'bank',
      id: t.id,
      date: t.date,
      direction: t.direction === 'debit' ? 'to_manish' : 'from_manish',
      amount: amt,
      label: t.narration,
      claimed: matchedTxnIds.has(t.id),
    });
  }
  // Claims that have no bank match count too (cash / other accounts).
  for (const c of claims) {
    if (c.matchedTxnId) continue;
    if (c.direction === 'to_manish') sent += c.amount;
    else received += c.amount;
    entries.push({
      kind: c.mode === 'cash' ? 'cash' : 'claim',
      id: c.id,
      date: c.date,
      direction: c.direction,
      amount: c.amount,
      label: c.text,
      claimed: true,
      unverified: c.mode !== 'cash',
    });
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { sent, received, net: sent - received, entries };
}
