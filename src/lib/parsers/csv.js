// CSV parser for bank statement exports (HDFC, ICICI, Axis, SBI, Kotak etc.
// all offer CSV/XLS download from netbanking — CSV needs no password, unlike
// their PDFs).
//
// Strategy: parse rows, auto-detect the header row, then map columns by
// fuzzy header names: date, narration/description, debit/withdrawal,
// credit/deposit, amount + dr/cr indicator.

import { parseIndianDate, parseAmount } from './common.js';

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const DATE_HEADERS = ['txn date', 'transaction date', 'value date', 'date', 'tran date'];
const DESC_HEADERS = ['narration', 'description', 'particulars', 'transaction remarks', 'remarks', 'details'];
const DEBIT_HEADERS = ['withdrawal amt', 'withdrawal', 'debit', 'debit amount', 'dr amount', 'withdrawals'];
const CREDIT_HEADERS = ['deposit amt', 'deposit', 'credit', 'credit amount', 'cr amount', 'deposits'];
const AMOUNT_HEADERS = ['amount', 'transaction amount', 'amount (inr)'];
const DRCR_HEADERS = ['dr/cr', 'dr / cr', 'type', 'cr/dr'];
const BALANCE_HEADERS = ['closing balance', 'running balance', 'balance (inr)', 'balance'];

function findCol(headers, names) {
  for (const name of names) {
    const i = headers.findIndex((h) => h === name);
    if (i !== -1) return i;
  }
  for (const name of names) {
    const i = headers.findIndex((h) => h.includes(name));
    if (i !== -1) return i;
  }
  return -1;
}

export function parseCsvStatement(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map(splitCsvLine);

  // Find the header row: the first row containing a date-ish and a desc-ish header.
  let headerIdx = -1;
  let cols = null;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const headers = rows[i].map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
    const date = findCol(headers, DATE_HEADERS);
    const desc = findCol(headers, DESC_HEADERS);
    if (date !== -1 && desc !== -1) {
      headerIdx = i;
      cols = {
        date,
        desc,
        debit: findCol(headers, DEBIT_HEADERS),
        credit: findCol(headers, CREDIT_HEADERS),
        amount: findCol(headers, AMOUNT_HEADERS),
        drcr: findCol(headers, DRCR_HEADERS),
        balance: findCol(headers, BALANCE_HEADERS),
      };
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('Could not find a header row with date + narration columns. Export the statement as CSV from netbanking and try again.');
  }

  const out = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const date = parseIndianDate(row[cols.date]);
    if (!date) continue;
    const narration = row[cols.desc] || '';
    let amount = null;
    let direction = null;
    if (cols.debit !== -1 || cols.credit !== -1) {
      const dr = cols.debit !== -1 ? parseAmount(row[cols.debit]) : null;
      const cr = cols.credit !== -1 ? parseAmount(row[cols.credit]) : null;
      if (dr) {
        amount = dr;
        direction = 'debit';
      } else if (cr) {
        amount = cr;
        direction = 'credit';
      }
    }
    if (amount == null && cols.amount !== -1) {
      const a = parseAmount(row[cols.amount]);
      if (a != null) {
        amount = Math.abs(a);
        const flag = cols.drcr !== -1 ? (row[cols.drcr] || '').toLowerCase() : '';
        if (flag.includes('cr')) direction = 'credit';
        else if (flag.includes('dr') || flag.includes('db')) direction = 'debit';
        else direction = a < 0 ? 'debit' : 'credit';
      }
    }
    if (amount == null || !direction) continue;
    let balance = null;
    if (cols.balance !== -1 && row[cols.balance] != null) {
      // Kotak suffixes the balance with (Cr)/(Dr)
      balance = parseAmount(String(row[cols.balance]).replace(/\(?\s*(cr|dr)\s*\)?\.?\s*$/i, ''));
    }
    out.push({ date, narration, amount, direction, ...(balance != null ? { balance } : {}) });
  }
  return out;
}
