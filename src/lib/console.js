// Console API: exposes the whole action layer as `window.munshi` so the app
// can be inspected and driven from the browser DevTools console. The UI is
// just one client of the action layer — this is the other.
// Full reference: docs/MODEL.md § 5.

import {
  getState,
  addAccount, updateAccount, removeAccount,
  importTransactions, addManualTransaction, updateTransaction, deleteTransaction, tagTransaction,
  addRule, removeRule,
  addTranche, removeTranche,
  addManishClaims, updateManishClaim, removeManishClaim,
  addLoan, updateLoan, removeLoan,
  exportAll, importAll,
} from './store.js';
import { applyRules, guessMerchantToken, HEAD_NAMES } from './categorize.js';
import { suggestTag } from './suggest.js';
import { monthlyTurnover, averageBalance, detectBounces, detectEmis, detectRecurring } from './analysis.js';
import { autoMatchClaims, manishLedger } from './reconcile.js';
import { cardOutstanding, computeAdvice, avgMonthlyIncome } from './advice.js';
import { parseCsvStatement } from './parsers/csv.js';
import { parseAlerts } from './parsers/alerts.js';
import { parseWhatsAppChat } from './parsers/whatsapp.js';

const S = () => getState();

const munshi = {
  get state() {
    return S();
  },

  actions: {
    addAccount, updateAccount, removeAccount,
    importTransactions, addManualTransaction, updateTransaction, deleteTransaction, tagTransaction,
    addRule, removeRule,
    addTranche, removeTranche,
    addManishClaims, updateManishClaim, removeManishClaim,
    addLoan, updateLoan, removeLoan,
    importAll,
  },

  analyze: {
    turnover: () => monthlyTurnover(S().transactions),
    averageBalance: (accountId, days = 30) => averageBalance(S().transactions, accountId, days),
    bounces: () => detectBounces(S().transactions),
    emis: () => detectEmis(S().transactions),
    recurring: () => detectRecurring(S().transactions),
    income: () => avgMonthlyIncome(S().transactions),
    cardOutstanding: (accountId) => {
      const acc = S().accounts.find((a) => a.id === accountId);
      return acc ? cardOutstanding(S().transactions, acc) : null;
    },
    advice: () => computeAdvice({ accounts: S().accounts, transactions: S().transactions, loans: S().loans }),
    manish: () => manishLedger(S().manishClaims, S().transactions),
    matchClaims: () => autoMatchClaims(S().manishClaims, S().transactions),
    suggest: (txnId) => {
      const t = S().transactions.find((x) => x.id === txnId);
      return t ? suggestTag(t, S().transactions.filter((x) => x.head)) : null;
    },
  },

  parse: {
    csv: parseCsvStatement,
    alerts: parseAlerts,
    whatsapp: parseWhatsAppChat,
    rules: (narration) => applyRules(narration, S().rules),
    merchant: guessMerchantToken,
  },

  heads: HEAD_NAMES,

  backup() {
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'munshi-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    return 'backup downloaded';
  },

  help() {
    console.log(
      [
        '— munshi console —',
        'munshi.state                          live state (accounts, transactions, rules, tranches, manishClaims, loans)',
        'munshi.actions.*                      every mutation: ' + Object.keys(munshi.actions).join(', '),
        'munshi.analyze.turnover()             monthly credits/debits/net',
        "munshi.analyze.averageBalance('hdfc', 30)",
        'munshi.analyze.bounces() / emis() / recurring() / income() / advice()',
        'munshi.analyze.manish() / matchClaims()',
        "munshi.analyze.cardOutstanding('<cardAccountId>')",
        "munshi.parse.alerts('Rs.449.00 debited from a/c **1234 on 01-07-26 to VPA swiggy@ybl')",
        'munshi.parse.csv(text) / whatsapp(text, myName) / rules(narration) / merchant(narration)',
        'munshi.heads                          all spend heads',
        'munshi.backup()                       download JSON backup',
        'Full model & action definitions: docs/MODEL.md',
      ].join('\n')
    );
  },
};

if (typeof window !== 'undefined') {
  window.munshi = munshi;
  console.log(
    '%cmunshi%c console ready — type munshi.help()',
    'background:#2f81f7;color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold',
    'color:inherit'
  );
}

export default munshi;
