import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAdvice, cardOutstanding, avgMonthlyIncome } from '../src/lib/advice.js';

const T = (over) => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'hdfc',
  direction: 'debit',
  head: null,
  scope: null,
  ...over,
});

test('cardOutstanding: spends minus payments, manual override wins', () => {
  const card = { id: 'cc1', type: 'card', label: 'Card' };
  const txns = [
    T({ accountId: 'cc1', date: '2026-07-01', amount: 10000 }),
    T({ accountId: 'cc1', date: '2026-07-05', amount: 4000, direction: 'credit' }),
    T({ accountId: 'hdfc', date: '2026-07-05', amount: 999 }), // other account, ignored
  ];
  assert.equal(cardOutstanding(txns, card), 6000);
  assert.equal(cardOutstanding(txns, { ...card, outstanding: '2500' }), 2500);
});

test('avgMonthlyIncome excludes tranches and self transfers', () => {
  const txns = [
    T({ date: '2026-06-01', direction: 'credit', amount: 100000 }),
    T({ date: '2026-07-01', direction: 'credit', amount: 200000 }),
    T({ date: '2026-07-02', direction: 'credit', amount: 5000000, head: 'Investor Tranche In' }),
    T({ date: '2026-07-03', direction: 'credit', amount: 50000, head: 'Self Transfer' }),
  ];
  assert.equal(avgMonthlyIncome(txns), 150000);
});

test('advice: high utilisation, FOIR breach and bounce leak all flagged', () => {
  const accounts = [
    { id: 'hdfc', type: 'bank', label: 'HDFC' },
    { id: 'cc1', type: 'card', label: 'Regalia', limit: '100000' },
  ];
  const loans = [{ id: 'l1', lender: 'Bajaj Finance', outstanding: 300000, emi: 60000, rate: 16 }];
  const txns = [
    T({ date: '2026-07-01', direction: 'credit', amount: 100000 }),
    T({ accountId: 'cc1', date: '2026-07-02', amount: 95000 }),
    T({ date: '2026-07-03', amount: 590, narration: 'NACH RTN CHG-MANDATE FAIL' }),
  ];
  const advice = computeAdvice({ accounts, transactions: txns, loans }, new Date('2026-07-19'));
  const titles = advice.map((a) => a.title).join(' | ');
  assert.match(titles, /nearly maxed/i);
  assert.match(titles, /EMIs eat 60%/i);
  assert.match(titles, /bounce\/return charges/i);
  // warns sort before infos
  assert.equal(advice[0].level, 'warn');
});

test('advice: healthy data produces good/info, never crashes empty', () => {
  const ok = computeAdvice({ accounts: [], transactions: [], loans: [] });
  assert.ok(ok.length >= 1);
  const healthy = computeAdvice({
    accounts: [{ id: 'hdfc', type: 'bank', label: 'HDFC' }],
    transactions: [
      T({ date: '2026-07-01', direction: 'credit', amount: 200000 }),
      T({ date: '2026-07-05', amount: 50000, head: 'Rent (Home)', scope: 'personal' }),
    ],
    loans: [{ id: 'l1', lender: 'HDFC Ltd', outstanding: 100000, emi: 20000, rate: 9 }],
  });
  assert.ok(healthy.some((a) => a.title.includes('EMI load healthy')));
  assert.ok(healthy.some((a) => a.title.includes('Savings rate 75%')));
});
