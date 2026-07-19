// PDF bank-statement parser (client-side, via pdf.js — the PDF never
// leaves the browser).
//
// Indian bank statement PDFs are tables of: date | narration | ... |
// withdrawal | deposit | balance (layouts vary by bank). Strategy:
//  1. Extract positioned text items per page and group them into lines by
//     Y coordinate.
//  2. A transaction row starts with a date; continuation lines are folded
//     into the narration.
//  3. The trailing numbers on a row are amount(s) + running balance. The
//     direction (debit/credit) is inferred from the running-balance delta
//     between consecutive rows, which works regardless of column layout;
//     explicit Dr/Cr markers are used when present.

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseIndianDate, parseAmount } from './common.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const DATE_RE = /^(\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4}|\d{1,2}[-/ ][A-Za-z]{3}[A-Za-z]*[-/, ]+\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const NUM_RE = /(?:[\d,]+\.\d{2})(?:\s*\(?(Cr|Dr|CR|DR)\)?\.?)?/g;

async function extractLines(data, password) {
  const doc = await pdfjsLib.getDocument({ data, password }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3; // bucket Y to merge same-line items
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], str: item.str });
    }
    const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]); // top to bottom
    for (const [, items] of sorted) {
      items.sort((a, b) => a.x - b.x);
      lines.push(items.map((i) => i.str).join('  ').replace(/\s+/g, ' ').trim());
    }
  }
  return lines;
}

export async function parsePdfStatement(arrayBuffer, password = '') {
  let lines;
  try {
    lines = await extractLines(arrayBuffer, password);
  } catch (e) {
    if (e?.name === 'PasswordException') {
      throw new Error('PASSWORD_REQUIRED');
    }
    throw e;
  }

  // Fold rows: a row starts with a date; following non-date, non-numeric-tail
  // lines are narration continuations.
  const rawRows = [];
  for (const line of lines) {
    if (DATE_RE.test(line)) {
      rawRows.push(line);
    } else if (rawRows.length && !/^(page \d|statement|opening balance|closing balance|total)/i.test(line)) {
      // continuation of narration — append only if the line has no trailing numbers
      if (!/[\d,]+\.\d{2}\s*$/.test(line)) {
        rawRows[rawRows.length - 1] += ' ' + line;
      }
    }
  }

  const rows = [];
  for (const raw of rawRows) {
    const dateMatch = raw.match(DATE_RE);
    const date = parseIndianDate(dateMatch[1]);
    if (!date) continue;
    let rest = raw.slice(dateMatch[0].length).trim();
    // strip a second (value) date if the row has one
    const second = rest.match(DATE_RE);
    if (second && second.index === 0) rest = rest.slice(second[0].length).trim();

    const nums = [...rest.matchAll(NUM_RE)];
    if (!nums.length) continue;
    const values = nums.map((m) => ({
      amount: parseAmount(m[0].replace(/\(?(Cr|Dr)\)?\.?/i, '')),
      flag: (m[1] || '').toLowerCase(),
      index: m.index,
    })).filter((v) => v.amount != null);
    if (!values.length) continue;

    const narration = rest.slice(0, values[0].index).replace(/\s+/g, ' ').trim();
    const balanceEntry = values[values.length - 1];
    const amountEntry = values.length >= 2 ? values[values.length - 2] : null;
    rows.push({
      date,
      narration,
      amount: amountEntry ? amountEntry.amount : null,
      amountFlag: amountEntry ? amountEntry.flag : '',
      balance: balanceEntry.amount,
      balanceFlag: balanceEntry.flag,
    });
  }

  // Infer direction. Prefer explicit Dr/Cr flag on the amount; otherwise use
  // the running-balance delta.
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.amount == null) continue;
    let direction = null;
    if (r.amountFlag === 'dr') direction = 'debit';
    else if (r.amountFlag === 'cr') direction = 'credit';
    else if (i > 0 && rows[i - 1].balance != null && r.balance != null) {
      const delta = r.balance - rows[i - 1].balance;
      if (Math.abs(Math.abs(delta) - r.amount) < 0.011) {
        direction = delta < 0 ? 'debit' : 'credit';
      }
    }
    if (!direction && i === 0 && rows.length > 1) {
      // can't infer the first row from a previous balance; try the next row backwards
      direction = null;
    }
    const balanceField = r.balance != null ? { balance: r.balance } : {};
    if (!direction) {
      // fall back: mark as debit but flag for review
      direction = 'debit';
      out.push({ date: r.date, narration: r.narration, amount: r.amount, direction, uncertain: true, ...balanceField });
      continue;
    }
    out.push({ date: r.date, narration: r.narration, amount: r.amount, direction, ...balanceField });
  }

  if (!out.length) {
    throw new Error(
      'No transactions found in this PDF. If it is a scanned/image statement, download the CSV/Excel version from netbanking instead — or the text layout may be unusual, in which case try CSV.'
    );
  }
  return out;
}
