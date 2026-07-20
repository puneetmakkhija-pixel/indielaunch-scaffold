// Similarity-based tag suggestions: when rules don't match, suggest the
// head/scope of the most similar transaction the user has already tagged.
// (The rules → similarity → LLM ladder used by modern open-source
// categorizers; this is the middle rung, done client-side with token
// overlap so no data leaves the browser.)

const STOP = new Set([
  'UPI', 'IMPS', 'NEFT', 'RTGS', 'ACH', 'NACH', 'ECS', 'POS', 'ATM', 'MB',
  'TXN', 'REF', 'PAYMENT', 'TRANSFER', 'FROM', 'THE', 'AND', 'FOR', 'LTD',
  'LIMITED', 'PVT', 'INDIA', 'BANK', 'DEBIT', 'CREDIT',
]);

export function tokenize(narration) {
  return new Set(
    (narration || '')
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// Returns {head, scope, score, example} or null.
export function suggestTag(txn, taggedTxns) {
  const mine = tokenize(txn.narration);
  if (!mine.size) return null;
  let best = null;
  let bestScore = 0;
  for (const other of taggedTxns) {
    if (other.id === txn.id || !other.head) continue;
    const score = jaccard(mine, tokenize(other.narration));
    if (score > bestScore) {
      bestScore = score;
      best = other;
    }
  }
  if (!best || bestScore < 0.34) return null;
  return { head: best.head, scope: best.scope, score: bestScore, example: best.narration };
}
