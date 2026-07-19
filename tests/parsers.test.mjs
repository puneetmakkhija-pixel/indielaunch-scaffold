import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvStatement } from '../src/lib/parsers/csv.js';
import { parseWhatsAppChat } from '../src/lib/parsers/whatsapp.js';
import { parseIndianDate, parseAmount } from '../src/lib/parsers/common.js';

test('dates: formats used by HDFC / IndusInd / Kotak statements', () => {
  assert.equal(parseIndianDate('01/07/26'), '2026-07-01'); // HDFC CSV
  assert.equal(parseIndianDate('05/07/2026'), '2026-07-05'); // IndusInd
  assert.equal(parseIndianDate('01-07-2026'), '2026-07-01'); // Kotak
  assert.equal(parseIndianDate('02-Jul-26'), '2026-07-02'); // Kotak dd-MMM-yy
  assert.equal(parseIndianDate('2 Jul, 2026'), '2026-07-02');
  assert.equal(parseIndianDate('2026-07-02'), '2026-07-02');
  assert.equal(parseIndianDate('31/02/2026'), null); // impossible date
});

test('amounts: lakh separators, negatives, blanks', () => {
  assert.equal(parseAmount('1,23,456.78'), 123456.78);
  assert.equal(parseAmount('(500)'), -500);
  assert.equal(parseAmount('₹ 2,500.00'), 2500);
  assert.equal(parseAmount('-'), null);
  assert.equal(parseAmount(''), null);
});

test('HDFC CSV: Withdrawal/Deposit columns', () => {
  const csv = [
    'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    '01/07/26,UPI-ZOMATO-zomato@paytm,0000,01/07/26,350.00,,"1,20,551.00"',
    '02/07/26,NEFT CR-INVESTOR CAPITAL LLP,0001,02/07/26,,"5,00,000.00","6,20,551.00"',
  ].join('\n');
  const out = parseCsvStatement(csv);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { date: '2026-07-01', narration: 'UPI-ZOMATO-zomato@paytm', amount: 350, direction: 'debit', balance: 120551 });
  assert.equal(out[1].direction, 'credit');
  assert.equal(out[1].amount, 500000);
});

test('Kotak CSV variant A: Sl No + Debit/Credit columns', () => {
  const csv = [
    'Kotak Mahindra Bank',
    'Account Statement for CRN XXXXX',
    ',,,,,,,',
    'Sl. No.,Transaction Date,Value Date,Description,Chq / Ref No.,Debit,Credit,Balance',
    '1,01-07-2026,01-07-2026,UPI/SWIGGY/512345/swiggy@ybl,UPI-512345,449.00,,"85,551.00"',
    '2,03-07-2026,03-07-2026,NEFT/INVESTOR CAPITAL LLP/TRANCHE2,NEFT-88,,"5,00,000.00","5,85,551.00"',
  ].join('\n');
  const out = parseCsvStatement(csv);
  assert.equal(out.length, 2);
  assert.equal(out[0].direction, 'debit');
  assert.equal(out[1].direction, 'credit');
});

test('Kotak CSV variant B: Amount + Dr/Cr indicator, dd-MMM-yy', () => {
  const csv = [
    'Sl. No.,Transaction Date,Value Date,Description,Chq / Ref No.,Amount,Dr / Cr,Balance',
    '1,02-Jul-26,02-Jul-26,MB TRANSFER TO MANISH KUMAR,IMPS-9921,"50,000.00",DR,"35,551.00"',
    '2,04-Jul-26,04-Jul-26,ACH RAZORPAY SOFTWARE,ACH-11,"1,20,000.00",CR,"1,55,551.00"',
  ].join('\n');
  const out = parseCsvStatement(csv);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((t) => [t.date, t.direction, t.amount]),
    [['2026-07-02', 'debit', 50000], ['2026-07-04', 'credit', 120000]]
  );
});

test('IndusInd CSV: Particulars + Withdrawal/Deposit', () => {
  const csv = [
    'IndusInd Bank Limited',
    'Statement of Account',
    'Date,Particulars,Chq./Ref. No,Withdrawal,Deposit,Balance',
    '05/07/2026,POS AMAZON PAY INDIA MUMBAI,POS884,"1,250.00",,"98,750.00"',
    '06/07/2026,NEFT CR AXIS CLIENT PAYMENT,N221,,"48,000.00","1,46,750.00"',
  ].join('\n');
  const out = parseCsvStatement(csv);
  assert.equal(out.length, 2);
  assert.equal(out[0].direction, 'debit');
  assert.equal(out[1].direction, 'credit');
});

test('WhatsApp: Android + iOS formats, English + Hinglish, cash detection', () => {
  const chat = [
    '12/07/2026, 10:31 pm - Puneet: Sent 50000 to your HDFC just now',
    '13/07/2026, 9:00 am - Manish: bhej diya 25k for vendor',
    '14/07/2026, 6:15 pm - Puneet: cash de diya ₹30,000 haath me',
    '[16/07/26, 11:20:45 AM] Puneet: transferred rs 2,50,000 tranche use',
    '15/07/2026, 1:00 pm - Manish: received 1 lakh, will pay vendor at 5 pm',
    '16/07/2026, 2:00 pm - Manish: meeting at 3 tomorrow',
  ].join('\n');
  const { claims } = parseWhatsAppChat(chat, 'Puneet');
  assert.equal(claims.length, 5);
  assert.deepEqual(
    claims.map((c) => [c.direction, c.amount, c.mode]),
    [
      ['to_manish', 50000, 'unknown'],
      ['from_manish', 25000, 'unknown'],
      ['to_manish', 30000, 'cash'],
      ['to_manish', 250000, 'unknown'],
      ['to_manish', 100000, 'unknown'], // Manish says "received" => money went to him
    ]
  );
});
