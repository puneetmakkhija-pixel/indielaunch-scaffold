import { useSyncExternalStore } from 'react';
import { DEFAULT_RULES, applyRules, defaultScopeForHead } from './categorize.js';
import { findSelfTransferPairs } from './selfTransfers.js';
import PREFILL from '../data/prefill.json';

const KEY = 'munshi_state_v1';

// The repo ships no personal data: accounts, emails, person-specific rules
// and the profile all arrive via prefill.json (local only) or backup restore.
const emptyState = {
  accounts: [
    { id: 'cash', label: 'Cash in hand', bank: 'Cash', last4: '', email: '', type: 'cash' },
  ],
  transactions: [],
  rules: DEFAULT_RULES,
  tranches: [],
  manishClaims: [],
  // Full WhatsApp chat with the ledger partner, for the date-synced
  // reconciliation view. Local-only (backup), never in the repo.
  chatMessages: [],
  // Agreed opening balance for the partner ledger: { date, youOwe, note }.
  manishAnchor: null,
  loans: [],
  emails: [],
  // profile powers narration matching without names in code:
  //   ownTokens      — substrings that identify YOU in a narration
  //   partnerTokens  — substrings that identify the ledger partner's side
  //   partnerExclude — lookalikes to ignore (e.g. someone sharing a name)
  profile: { ownTokens: [], partnerTokens: [], partnerExclude: [] },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    // First run: hydrate from the bundled prefill (statements, accounts,
    // loans, chat claims parsed up-front). Rules always come from code so
    // new builtin rules apply immediately.
    if (!raw) return { ...structuredClone(emptyState), ...structuredClone(PREFILL) };
    const parsed = JSON.parse(raw);
    return { ...structuredClone(emptyState), ...parsed };
  } catch {
    return structuredClone(emptyState);
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('persist failed', e);
  }
}

export function setState(updater) {
  state = { ...state, ...updater(state) };
  persist();
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

export function useStore() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state
  );
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Dedup key so re-importing the same statement doesn't duplicate rows.
export function txnHash(t) {
  return [t.date, t.amount, t.direction, (t.narration || '').replace(/\s+/g, ' ').trim().toUpperCase()].join('|');
}

// ---- actions ----

export function addAccount(acc) {
  setState((s) => ({ accounts: [...s.accounts, { id: uid(), type: 'bank', ...acc }] }));
}

export function updateAccount(id, patch) {
  setState((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
}

export function removeAccount(id) {
  setState((s) => ({
    accounts: s.accounts.filter((a) => a.id !== id),
    transactions: s.transactions.filter((t) => t.accountId !== id),
  }));
}

// Import parsed transactions: dedupe against existing, auto-tag via rules.
export function importTransactions(accountId, parsed, source) {
  let added = 0;
  let skipped = 0;
  setState((s) => {
    const existing = new Set(s.transactions.map(txnHash));
    const fresh = [];
    for (const p of parsed) {
      const t = {
        id: uid(),
        source,
        reviewed: false,
        head: null,
        scope: null,
        trancheId: null,
        ...p,
        accountId: p.accountId || accountId,
      };
      const h = txnHash(t);
      if (existing.has(h)) {
        skipped++;
        continue;
      }
      existing.add(h);
      const match = applyRules(t.narration, s.rules, t.accountId, t.direction);
      if (match) {
        t.head = match.head;
        t.scope = match.scope;
        t.autoTagged = true;
      }
      fresh.push(t);
      added++;
    }
    let transactions = [...s.transactions, ...fresh].sort((a, b) => (a.date < b.date ? 1 : -1));
    // The same rupee lands twice when it moves between own accounts — debit
    // in the source statement, credit in the destination one. Pair them up
    // front so totals never double-count internal movements.
    const { patches } = findSelfTransferPairs(transactions, s.accounts, s.profile);
    if (patches.size) {
      transactions = transactions.map((t) => (patches.has(t.id) ? { ...t, ...patches.get(t.id) } : t));
    }
    return { transactions };
  });
  return { added, skipped };
}

// Re-run A→B pair detection over the full ledger (e.g. after restoring an
// older backup). Returns the number of pairs found.
export function detectSelfTransfers() {
  let matched = 0;
  setState((s) => {
    const { pairs, patches } = findSelfTransferPairs(s.transactions, s.accounts, s.profile);
    matched = pairs.length;
    if (!patches.size) return {};
    return { transactions: s.transactions.map((t) => (patches.has(t.id) ? { ...t, ...patches.get(t.id) } : t)) };
  });
  return matched;
}

// Bulk-approve: mark many transactions reviewed in one state update.
export function reviewTransactions(ids) {
  const set = new Set(ids);
  setState((s) => ({
    transactions: s.transactions.map((t) => (set.has(t.id) ? { ...t, reviewed: true } : t)),
  }));
  return set.size;
}

export function updateTransaction(id, patch) {
  setState((s) => ({
    transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }));
}

export function deleteTransaction(id) {
  setState((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
}

export function addManualTransaction(t) {
  return importTransactions(t.accountId, [t], 'manual');
}

// Tag a transaction and optionally remember it as a rule for future imports.
export function tagTransaction(id, { head, scope, rememberPattern }) {
  setState((s) => {
    let rules = s.rules;
    if (rememberPattern && rememberPattern.trim()) {
      rules = [
        { id: uid(), pattern: rememberPattern.trim(), head, scope: scope ?? defaultScopeForHead(head) },
        ...rules.filter((r) => r.pattern.toUpperCase() !== rememberPattern.trim().toUpperCase()),
      ];
    }
    const transactions = s.transactions.map((t) =>
      t.id === id ? { ...t, head, scope: scope ?? defaultScopeForHead(head), reviewed: true, autoTagged: false } : t
    );
    // Retro-apply the new rule to other untagged, unreviewed transactions.
    const retagged = rememberPattern
      ? transactions.map((t) => {
          if (t.reviewed || t.head) return t;
          const m = applyRules(t.narration, rules, t.accountId, t.direction);
          return m ? { ...t, head: m.head, scope: m.scope, autoTagged: true } : t;
        })
      : transactions;
    return { rules, transactions: retagged };
  });
}

export function addRule(rule) {
  setState((s) => ({ rules: [{ id: uid(), ...rule }, ...s.rules] }));
}

export function removeRule(id) {
  setState((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
}

export function addTranche(t) {
  setState((s) => ({ tranches: [...s.tranches, { id: uid(), ...t }] }));
}

export function removeTranche(id) {
  setState((s) => ({
    tranches: s.tranches.filter((t) => t.id !== id),
    transactions: s.transactions.map((t) => (t.trancheId === id ? { ...t, trancheId: null } : t)),
  }));
}

export function addManishClaims(claims) {
  let added = 0;
  setState((s) => {
    const seen = new Set(s.manishClaims.map((c) => c.date + '|' + c.amount + '|' + c.text));
    const fresh = [];
    for (const c of claims) {
      const k = c.date + '|' + c.amount + '|' + c.text;
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push({ id: uid(), matchedTxnId: null, ...c });
      added++;
    }
    return { manishClaims: [...s.manishClaims, ...fresh] };
  });
  return added;
}

export function updateManishClaim(id, patch) {
  setState((s) => ({ manishClaims: s.manishClaims.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

export function removeManishClaim(id) {
  setState((s) => ({ manishClaims: s.manishClaims.filter((c) => c.id !== id) }));
}

export function addEmail(email) {
  setState((s) => {
    const address = (email.address || '').trim().toLowerCase();
    if (!address || s.emails.some((e) => e.address.toLowerCase() === address)) return {};
    return { emails: [...s.emails, { id: uid(), label: '', ...email, address }] };
  });
}

export function removeEmail(id) {
  setState((s) => ({ emails: s.emails.filter((e) => e.id !== id) }));
}

export function addLoan(loan) {
  setState((s) => ({ loans: [...s.loans, { id: uid(), ...loan }] }));
}

export function updateLoan(id, patch) {
  setState((s) => ({ loans: s.loans.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
}

export function removeLoan(id) {
  setState((s) => ({ loans: s.loans.filter((l) => l.id !== id) }));
}

export function exportAll() {
  return JSON.stringify(state, null, 2);
}

export function importAll(json) {
  const parsed = JSON.parse(json);
  setState(() => {
    const next = { ...structuredClone(emptyState), ...parsed };
    // A restore should leave no work behind that the app can do itself:
    // auto-tag anything untagged with the restored rules, then pair A→B
    // self transfers so both legs of own-account moves land as internal.
    next.transactions = (next.transactions || []).map((t) => {
      if (t.head) return t;
      const m = applyRules(t.narration, next.rules, t.accountId, t.direction);
      return m ? { ...t, head: m.head, scope: m.scope, autoTagged: true } : t;
    });
    const { patches } = findSelfTransferPairs(next.transactions, next.accounts, next.profile);
    if (patches.size) {
      next.transactions = next.transactions.map((t) => (patches.has(t.id) ? { ...t, ...patches.get(t.id) } : t));
    }
    return next;
  });
}
