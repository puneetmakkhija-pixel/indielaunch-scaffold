// A→B self-transfer detection: the same rupee moving between two of your own
// accounts shows up twice — a debit in the source statement and a credit in
// the destination statement. Pair them up so totals count the money once.
//
// A pair is: opposite directions, different accounts, identical amount,
// dates within MAX_DAYS — plus an evidence gate checked on EACH leg
// separately (a debit to some third party must never be swallowed just
// because its credit-side candidate mentions your own name):
//   - bank → bank: every leg must reference yourself (profile.ownTokens /
//     SWEEP / SELF), or the other account's number — or both legs must share
//     the same full UPI handle (id@psp), which only happens for self-payments.
//   - bank → card: the credit sits on a card account and reads like a bill
//     payment; the debit must name the card, the network, or yourself.
// Ledger-partner rows (head or profile.partnerTokens) are never pairable —
// those are the partner ledger, not sweeps.

const MAX_DAYS = 3;
const CARD_PAY_RE = /PAYMENT RECEIVED|THANK ?YOU|PAYMENT-THANK|INDIE PAYMENT|CRED CLUB|CRED[./]|CRED\b|BBPS|AMEX|AMERICAN EXPRESS|SBI ?CARD|INDUSIND CREDIT CARD|CC PAYMENT|CARD PAYMENT|INFINITY/i;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function tokensToRegex(tokens) {
  const list = (tokens || []).filter(Boolean);
  return list.length ? new RegExp(list.map(esc).join('|'), 'i') : null;
}

const EXCLUDED_HEADS = new Set(['Self Transfer', 'Card Bill Payment']);

// Heads whose sums must not double-count internal movements.
export function isInternalHead(head) {
  return EXCLUDED_HEADS.has(head);
}

function pairable(t, neverRe) {
  if (neverRe && neverRe.test(t.narration || '')) return false;
  if (t.head === 'Manish Transfer') return false;
  // Never repurpose a row a human reviewed under a real spend head.
  if (t.reviewed && t.head && !EXCLUDED_HEADS.has(t.head)) return false;
  return true;
}

function dayDiff(a, b) {
  return Math.abs(new Date(a.slice(0, 10)) - new Date(b.slice(0, 10))) / 86400000;
}

function paise(amount) {
  return Math.round(amount * 100);
}

// One leg is "self-evidenced" if its narration mentions you or the account
// on the other end of the hop.
function selfEvidence(narration, otherAccount, ownRe) {
  const n = (narration || '').toUpperCase();
  if (ownRe.test(n)) return true;
  if (otherAccount?.last4 && n.includes(otherAccount.last4)) return true;
  return false;
}

// Full UPI handles (id@psp) are unique per person — if the debit's handle
// appears in the credit narration (or vice versa, allowing for a bank
// truncating leading digits), both legs are the same self-payment.
function sharedUpiHandle(a, b) {
  const A = (a || '').toUpperCase();
  const B = (b || '').toUpperCase();
  for (const [src, dst] of [[A, B], [B, A]]) {
    for (const m of src.matchAll(/[A-Z0-9.]{6,}@[A-Z]{2,}/g)) {
      if (dst.includes(m[0])) return true;
    }
  }
  return false;
}

// Returns { pairs: [{debit, credit, head}], patches: Map<txnId, patch> }.
export function findSelfTransferPairs(transactions, accounts, profile = {}) {
  const ownRe = tokensToRegex([...(profile.ownTokens || []), 'SWEEP', 'SELF']);
  const neverRe = tokensToRegex(profile.partnerTokens);
  const accountsById = Object.fromEntries((accounts || []).map((a) => [a.id, a]));
  const creditsByAmount = new Map();
  for (const t of transactions) {
    if (t.direction !== 'credit' || !pairable(t, neverRe)) continue;
    const k = paise(t.amount);
    if (!creditsByAmount.has(k)) creditsByAmount.set(k, []);
    creditsByAmount.get(k).push(t);
  }

  const used = new Set();
  const pairs = [];
  const debits = transactions
    .filter((t) => t.direction === 'debit' && pairable(t, neverRe))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const d of debits) {
    const candidates = (creditsByAmount.get(paise(d.amount)) || [])
      .filter((c) => !used.has(c.id) && c.accountId !== d.accountId && dayDiff(c.date, d.date) <= MAX_DAYS)
      .sort((a, b) => dayDiff(a.date, d.date) - dayDiff(b.date, d.date));

    for (const c of candidates) {
      const debitAcct = accountsById[d.accountId];
      const creditAcct = accountsById[c.accountId];
      let ok;
      if (creditAcct?.type === 'card') {
        const dn = (d.narration || '').toUpperCase();
        ok =
          CARD_PAY_RE.test(c.narration || '') &&
          (CARD_PAY_RE.test(dn) || ownRe.test(dn) || (creditAcct.last4 && dn.includes(creditAcct.last4)));
      } else {
        ok =
          (selfEvidence(d.narration, creditAcct, ownRe) && selfEvidence(c.narration, debitAcct, ownRe)) ||
          sharedUpiHandle(d.narration, c.narration);
      }
      if (!ok) continue;
      used.add(d.id);
      used.add(c.id);
      pairs.push({ debit: d, credit: c, head: creditAcct?.type === 'card' ? 'Card Bill Payment' : 'Self Transfer' });
      break;
    }
  }

  const patches = new Map();
  for (const p of pairs) {
    const pairId = p.debit.id + '~' + p.credit.id;
    for (const t of [p.debit, p.credit]) {
      if (t.head === p.head && t.selfPairId === pairId) continue; // already done
      patches.set(t.id, { head: p.head, scope: null, selfPairId: pairId, reviewed: true, autoTagged: true });
    }
  }
  return { pairs, patches };
}
