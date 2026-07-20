import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSelfTransferPairs, isInternalHead } from '../src/lib/selfTransfers.js';

const ACCOUNTS = [
  { id: 'hdfc', type: 'bank' },
  { id: 'kotak', type: 'bank' },
  { id: 'amex', type: 'card' },
];

const T = (over) => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'hdfc',
  direction: 'debit',
  head: null,
  scope: null,
  reviewed: false,
  ...over,
});

test('bank→bank: same amount, own-name narration, within window → paired once', () => {
  const debit = T({ date: '2026-07-01', amount: 50000, narration: 'IMPS-PUNEET MAKKHIJA-KOTAK' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 50000, narration: 'IMPS FROM PUNEET MAKKHIJA' });
  const { pairs, patches } = findSelfTransferPairs([debit, credit], ACCOUNTS);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].head, 'Self Transfer');
  assert.equal(patches.get(debit.id).head, 'Self Transfer');
  assert.equal(patches.get(credit.id).selfPairId, patches.get(debit.id).selfPairId);
});

test('bank→card bill payment pairs as Card Bill Payment', () => {
  const debit = T({ date: '2026-07-10', amount: 51413, narration: 'NEFT-AMERICAN EXPRESS-CARD PAYMENT' });
  const credit = T({ accountId: 'amex', direction: 'credit', date: '2026-07-12', amount: 51413, narration: 'PAYMENT RECEIVED, THANK YOU' });
  const { pairs } = findSelfTransferPairs([debit, credit], ACCOUNTS);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].head, 'Card Bill Payment');
});

test('shared UPI handle pairs even when the debit side lacks the name', () => {
  const debit = T({ accountId: 'kotak', date: '2026-01-28', amount: 30000, narration: 'UPI/602850490101/DR/PUNE/HDFC/11892299@pthdfc' });
  const credit = T({ direction: 'credit', date: '2026-01-28', amount: 30000, narration: 'UPI credit-PUNEET MAKHIJA-9811892299@pthdfc ref 602850' });
  const { pairs } = findSelfTransferPairs([debit, credit], ACCOUNTS);
  assert.equal(pairs.length, 1);
});

test('debit to a third party is not swallowed by an own-name credit (each leg needs evidence)', () => {
  // Regression: RTGS out to Manish Srivastav + unrelated self credit, same amount.
  const debit = T({ accountId: 'kotak', date: '2026-03-29', amount: 200000, narration: 'MB: Sent RTGS/ Manish srivastav/ PUNJAB NATIONAL' });
  const credit = T({ direction: 'credit', date: '2026-03-29', amount: 200000, narration: 'IMPS/P2A/609041812577/HDFC/PUNEET MAKHIJA' });
  const { pairs } = findSelfTransferPairs([debit, credit], ACCOUNTS);
  assert.equal(pairs.length, 0);
});

test('a third party round-trip (out to X, in from X) is not a self transfer', () => {
  const debit = T({ date: '2026-04-07', amount: 50000, narration: 'UPI/300315511647/DR/GIRI/PUNB/9891722456@upi' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-04-07', amount: 50000, narration: 'UPI credit-GIRISH KUMAR MAKHIJA-9891722456@ptaxis' });
  const { pairs } = findSelfTransferPairs([debit, credit], ACCOUNTS);
  assert.equal(pairs.length, 0);
});

test('unrelated external credit with same amount is NOT swallowed', () => {
  const debit = T({ date: '2026-07-01', amount: 40000, narration: 'UPI-SOME VENDOR-pay@ybl' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 40000, narration: 'NEFT-DEEPIKA SANJANA' });
  const { pairs } = findSelfTransferPairs([debit, credit], ACCOUNTS);
  assert.equal(pairs.length, 0);
});

test('Manish/Jaspreet rows never pair, even with matching amounts', () => {
  const debit = T({ date: '2026-07-01', amount: 300000, narration: 'RTGS-JASPREET KAUR' });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-02', amount: 300000, narration: 'IMPS PUNEET MAKKHIJA SELF' });
  const { pairs } = findSelfTransferPairs([debit, credit], ACCOUNTS);
  assert.equal(pairs.length, 0);
});

test('reviewed row under a real spend head is never repurposed', () => {
  const debit = T({ date: '2026-07-01', amount: 25000, narration: 'IMPS PUNEET MAKKHIJA', head: 'Rent (Home)', reviewed: true });
  const credit = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 25000, narration: 'IMPS FROM PUNEET MAKKHIJA' });
  const { pairs } = findSelfTransferPairs([debit, credit], ACCOUNTS);
  assert.equal(pairs.length, 0);
});

test('same account or outside the date window does not pair', () => {
  const debit = T({ date: '2026-07-01', amount: 10000, narration: 'PUNEET SELF' });
  const sameAcct = T({ direction: 'credit', date: '2026-07-01', amount: 10000, narration: 'PUNEET SELF' });
  const late = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-09', amount: 10000, narration: 'PUNEET SELF' });
  const { pairs } = findSelfTransferPairs([debit, sameAcct, late], ACCOUNTS);
  assert.equal(pairs.length, 0);
});

test('each credit is consumed at most once', () => {
  const d1 = T({ date: '2026-07-01', amount: 20000, narration: 'IMPS PUNEET MAKKHIJA' });
  const d2 = T({ date: '2026-07-02', amount: 20000, narration: 'IMPS PUNEET MAKKHIJA' });
  const c = T({ accountId: 'kotak', direction: 'credit', date: '2026-07-01', amount: 20000, narration: 'FROM PUNEET MAKKHIJA' });
  const { pairs } = findSelfTransferPairs([d1, d2, c], ACCOUNTS);
  assert.equal(pairs.length, 1);
});

test('isInternalHead covers both internal heads only', () => {
  assert.equal(isInternalHead('Self Transfer'), true);
  assert.equal(isInternalHead('Card Bill Payment'), true);
  assert.equal(isInternalHead('Manish Transfer'), false);
  assert.equal(isInternalHead(null), false);
});
