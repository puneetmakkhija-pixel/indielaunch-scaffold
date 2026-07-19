import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTurnover, averageBalance, detectBounces, detectEmis, detectRecurring } from '../src/lib/analysis.js';
import { suggestTag } from '../src/lib/suggest.js';
import { parseAlerts } from '../src/lib/parsers/alerts.js';

const T = (over) => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'hdfc',
  direction: 'debit',
  head: null,
  scope: null,
  ...over,
});

test('alerts: HDFC / Kotak / IndusInd style debit & credit alerts', () => {
  const text = [
    'Rs.449.00 debited from a/c **1234 on 01-07-26 to VPA swiggy@ybl (UPI Ref No 512345678901)',
    'Rs.50,000.00 is credited to a/c XX5678 on 02-Jul-26 by a/c linked to VPA manish@okhdfcbank',
    'INR 1,250.00 spent on card ending 4321 on 03/07/2026 at AMAZON PAY INDIA. Avl bal: 98,750.00',
    'Update: your OTP is 482913', // must not parse
  ].join('\n');
  const { transactions } = parseAlerts(text);
  assert.equal(transactions.length, 3);
  assert.deepEqual(
    transactions.map((t) => [t.date, t.direction, t.amount, t.last4]),
    [
      ['2026-07-01', 'debit', 449, '1234'],
      ['2026-07-02', 'credit', 50000, '5678'],
      ['2026-07-03', 'debit', 1250, '4321'],
    ]
  );
  assert.match(transactions[0].narration, /swiggy@ybl/);
});

test('turnover: per-month credit/debit totals, self transfers excluded', () => {
  const rows = [
    T({ date: '2026-06-10', direction: 'credit', amount: 500000 }),
    T({ date: '2026-06-15', amount: 20000 }),
    T({ date: '2026-07-01', amount: 30000 }),
    T({ date: '2026-07-02', direction: 'credit', amount: 100000, head: 'Self Transfer' }),
  ];
  const out = monthlyTurnover(rows);
  assert.deepEqual(out, [
    { month: '2026-07', credits: 0, debits: 30000, net: -30000 },
    { month: '2026-06', credits: 500000, debits: 20000, net: 480000 },
  ]);
});

test('average balance: EOD carry-forward over trailing window', () => {
  const rows = [
    T({ date: '2026-07-01', amount: 1, balance: 100 }),
    T({ date: '2026-07-02', amount: 1, balance: 200 }),
    // 03rd & 04th quiet -> carry 200
    T({ date: '2026-07-05', amount: 1, balance: 500 }),
  ];
  const r = averageBalance(rows, 'hdfc', 30);
  // days 1..5 EOD: 100,200,200,200,500 -> avg 240
  assert.equal(r.average, 240);
  assert.equal(r.coveredDays, 5);
});

test('bounce, EMI and recurring detection', () => {
  const rows = [
    T({ date: '2026-06-05', amount: 590, narration: 'NACH RTN CHG-MANDATE FAIL' }),
    T({ date: '2026-06-07', amount: 15000, narration: 'ACH D-BAJAJ FINANCE LTD-EMI 4421' }),
    T({ date: '2026-07-07', amount: 15000, narration: 'ACH D-BAJAJ FINANCE LTD-EMI 4421' }),
    T({ date: '2026-06-12', amount: 649, narration: 'UPI-NETFLIX ENTERTAINMENT-netflix@icici' }),
    T({ date: '2026-07-12', amount: 649, narration: 'UPI-NETFLIX ENTERTAINMENT-netflix@icici' }),
  ];
  const b = detectBounces(rows);
  assert.equal(b.count, 1);
  assert.equal(b.totalAmount, 590);

  const e = detectEmis(rows);
  assert.equal(e.length, 1);
  assert.equal(e[0].months, 2);
  assert.equal(e[0].avgAmount, 15000);

  const r = detectRecurring(rows);
  const netflix = r.find((x) => x.token.includes('NETFLIX'));
  assert.ok(netflix);
  assert.equal(netflix.count, 2);
});

test('suggestTag: untagged transaction inherits head of similar tagged one', () => {
  const tagged = [
    T({ date: '2026-06-01', narration: 'UPI-SWIGGY LIMITED-swiggy@axb-9921', head: 'Food & Dining', scope: 'personal' }),
    T({ date: '2026-06-02', narration: 'NEFT-ACME HOSTING SERVICES-INV221', head: 'SaaS & Software', scope: 'business' }),
  ];
  const s = suggestTag(T({ date: '2026-07-01', narration: 'UPI-SWIGGY LIMITED-swiggy@axb-8812' }), tagged);
  assert.equal(s.head, 'Food & Dining');
  assert.equal(s.scope, 'personal');
  const none = suggestTag(T({ date: '2026-07-01', narration: 'IMPS-RANDOM PERSON-99' }), tagged);
  assert.equal(none, null);
});
