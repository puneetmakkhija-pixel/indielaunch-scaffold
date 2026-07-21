import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSelfTransferPairs, isInternalHead } from '../src/lib/selfTransfers.js';

// All names, numbers, and handles below are fictional fixtures.
const ACCOUNTS = [
  { id: 'hdfc', type: 'bank', last4: '1111' },
  { id: 'kotak', type: 'bank', last4: '2222' },
  { id: 'amex', type: 'card', last4: '3333' },
];

const PROFILE = {
  ownTokens: ['ARJUN', 'TALWAR'],
  partnerTokens: ['RAKESH VER', 'HARLEEN'],
};

const T = (over) => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'hdfc',
  direction: 'debit',
  head: null,
  scope: null,
  reviewed: false,
  ...over,
});

const run = (txns) => findSelfTransferPairs(txns, ACCOUNTS, PROFILE);

test('bank→bank: same amount, own-name narration, within window → paired once', () => {
  const debit = T({ date: '2026-07-01', amount: 50000, narration: 'IMPS-ARJUN TALWAR-KOTAK' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 50000, narration: 'IMPS FROM ARJUN TALWAR' });
  const { pairs, patches } = run([debit, credit]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].head, 'Self Transfer');
  assert.equal(patches.get(debit.id).head, 'Self Transfer');
  assert.equal(patches.get(credit.id).selfPairId, patches.get(debit.id).selfPairId);
});

test('bank→card bill payment pairs as Card Bill Payment', () => {
  const debit = T({ date: '2026-07-10', amount: 51413, narration: 'NEFT-AMERICAN EXPRESS-CARD PAYMENT' });
  const credit = T({ accountId: 'amex', direction: 'credit', date: '2026-07-12', amount: 51413, narration: 'PAYMENT RECEIVED, THANK YOU' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].head, 'Card Bill Payment');
});

test('shared UPI handle pairs even when the debit side lacks the name', () => {
  const debit = T({ accountId: 'kotak', date: '2026-01-28', amount: 30000, narration: 'UPI/602850490101/DR/ARJ/HDFC/55555000@okbank' });
  const credit = T({ direction: 'credit', date: '2026-01-28', amount: 30000, narration: 'UPI credit-ARJUN TALWAR-9955555000@okbank ref 602850' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 1);
});

test('debit to a third party is not swallowed by an own-name credit (each leg needs evidence)', () => {
  // Regression: RTGS out to an unrelated payee + self credit, same amount.
  const debit = T({ accountId: 'kotak', date: '2026-03-29', amount: 200000, narration: 'MB: Sent RTGS/ Suresh chandra/ PUNJAB NATIONAL' });
  const credit = T({ direction: 'credit', date: '2026-03-29', amount: 200000, narration: 'IMPS/P2A/609041812577/HDFC/ARJUN TALWAR' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 0);
});

test('a third party round-trip (out to X, in from X) is not a self transfer', () => {
  const debit = T({ date: '2026-04-07', amount: 50000, narration: 'UPI/300315511647/DR/VIKA/PUNB/8811100022@upi' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-04-07', amount: 50000, narration: 'UPI credit-VIKAS TALWAR-8811100022@okaxis' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 0, 'shared surname must not pair two external legs');
});

test('unrelated external credit with same amount is NOT swallowed', () => {
  const debit = T({ date: '2026-07-01', amount: 40000, narration: 'UPI-SOME VENDOR-pay@ybl' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 40000, narration: 'NEFT-MEENA KUMARI' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 0);
});

test('partner-token rows never pair, even with matching amounts', () => {
  const debit = T({ date: '2026-07-01', amount: 300000, narration: 'RTGS-HARLEEN KAUR' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-02', amount: 300000, narration: 'IMPS ARJUN TALWAR SELF' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 0);
});

test('reviewed row under a real spend head is never repurposed', () => {
  const debit = T({ date: '2026-07-01', amount: 25000, narration: 'IMPS ARJUN TALWAR', head: 'Rent (Home)', reviewed: true });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 25000, narration: 'IMPS FROM ARJUN TALWAR' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 0);
});

test('same account or outside the date window does not pair', () => {
  const debit = T({ date: '2026-07-01', amount: 10000, narration: 'ARJUN SELF' });
  const sameAcct = T({ direction: 'credit', date: '2026-07-01', amount: 10000, narration: 'ARJUN SELF' });
  const late = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-09', amount: 10000, narration: 'ARJUN SELF' });
  const { pairs } = run([debit, sameAcct, late]);
  assert.equal(pairs.length, 0);
});

test('each credit is consumed at most once', () => {
  const d1 = T({ date: '2026-07-01', amount: 20000, narration: 'IMPS ARJUN TALWAR' });
  const d2 = T({ date: '2026-07-02', amount: 20000, narration: 'IMPS ARJUN TALWAR' });
  const c = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 20000, narration: 'FROM ARJUN TALWAR' });
  const { pairs } = run([d1, d2, c]);
  assert.equal(pairs.length, 1);
});

test('shared 12-digit reference pairs internal legs even with no name evidence', () => {
  const debit = T({ date: '2026-04-01', amount: 20000, narration: 'UPI to account ref 609163483645' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-04-01', amount: 20000, narration: 'UPI/609163483645/CR/XYZ/HDFC/998' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 1);
});

test('same amount + different people + no shared ref must NOT pair', () => {
  // Regression: real coincidence — payment to Subhash vs credit from Satish.
  const debit = T({ date: '2026-02-11', amount: 50000, narration: 'IMPS/P2A/604222717188/HDFC/SUBHASH KUMAR' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-02-11', amount: 50000, narration: 'UPI credit-SATISH ARAVIND-satish@ybl ref 998877665544' });
  const { pairs } = run([debit, credit]);
  assert.equal(pairs.length, 0);
});

test('with an empty profile only SWEEP/SELF and account-number evidence works', () => {
  const debit = T({ date: '2026-07-01', amount: 15000, narration: 'IMPS to account ending 2222' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 15000, narration: 'IMPS from a/c 1111' });
  const { pairs } = findSelfTransferPairs([debit, credit], ACCOUNTS, {});
  assert.equal(pairs.length, 1);
});

test('isInternalHead covers both internal heads only', () => {
  assert.equal(isInternalHead('Self Transfer'), true);
  assert.equal(isInternalHead('Card Bill Payment'), true);
  assert.equal(isInternalHead('Manish Transfer'), false);
  assert.equal(isInternalHead(null), false);
});
