import { useSyncExternalStore } from 'react';
import { DEFAULT_RULES, applyRules, defaultScopeForHead } from './categorize.js';

const KEY = 'munshi_state_v1';

const emptyState = {
  accounts: [
    { id: 'cash', label: 'Cash in hand', bank: 'Cash', last4: '', email: '', type: 'cash' },
    { id: 'hdfc', label: 'HDFC Savings (primary)', bank: 'HDFC', last4: '9780', email: 'puneetmakkhija@gmail.com', type: 'bank' },
    { id: 'indusind', label: 'IndusInd Select (personal)', bank: 'IndusInd', last4: '6786', email: 'puneetmakkhija@gmail.com', type: 'bank' },
    { id: 'indusind-cc', label: 'IndusInd Credit Card', bank: 'IndusInd', last4: '8829', email: 'puneetmakkhija@gmail.com', type: 'card' },
    { id: 'amex-plat', label: 'Amex Platinum charge', bank: 'American Express', last4: '1008', email: 'puneetmakkhija@gmail.com', type: 'card', dueDay: 11 },
    { id: 'amex-reserve', label: 'Amex Platinum Reserve', bank: 'American Express', last4: '1004', email: 'puneetmakkhija@gmail.com', type: 'card', limit: 586000, dueDay: 10 },
    { id: 'sbi-paytm', label: 'Paytm SBI Card', bank: 'SBI Card', last4: '7209', email: 'puneet.borntolead@gmail.com', type: 'card' },
    { id: 'indusind-cc2', label: 'IndusInd Card (second)', bank: 'IndusInd', last4: '5984', email: 'puneet.borntolead@gmail.com', type: 'card' },
    { id: 'kotak', label: 'Kotak — Cube Finserve (Manish co., DSA of BuddyLoan)', bank: 'Kotak', last4: '4444', email: 'puneetmakkhija@gmail.com', type: 'bank' },
  ],
  transactions: [],
  rules: DEFAULT_RULES,
  tranches: [],
  manishClaims: [],
  loans: [],
  emails: [
    { id: 'email-primary', address: 'puneetmakkhija@gmail.com', label: 'Personal' },
    { id: 'email-alt', address: 'puneet.borntolead@gmail.com', label: 'Personal (alt)' },
    { id: 'email-work', address: 'puneet.makhija@buddyloan.com', label: 'Work (BuddyLoan)' },
  ],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(emptyState);
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
      const match = applyRules(t.narration, s.rules, t.accountId);
      if (match) {
        t.head = match.head;
        t.scope = match.scope;
        t.autoTagged = true;
      }
      fresh.push(t);
      added++;
    }
    const transactions = [...s.transactions, ...fresh].sort((a, b) => (a.date < b.date ? 1 : -1));
    return { transactions };
  });
  return { added, skipped };
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
          const m = applyRules(t.narration, rules, t.accountId);
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
  setState(() => ({ ...structuredClone(emptyState), ...parsed }));
}
