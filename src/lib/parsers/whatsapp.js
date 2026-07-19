// WhatsApp chat export (.txt) parser.
//
// Finds money-movement messages in an exported chat (WhatsApp > chat >
// Export chat > Without media) and turns them into "claims": {date,
// direction, amount, mode, sender, text}. Claims are later reconciled
// against bank transactions on the Manish page; unmatched claims are
// usually the cash handovers.

import { parseIndianDate } from './common.js';

// Android: "12/07/2026, 10:31 pm - Puneet: Sent 50000"
// iOS:     "[12/07/26, 10:31:45 PM] Manish: received 50k"
const MSG_RE = /^\[?(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}),? (\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm|AM|PM)?)\]?\s*[-–]?\s*([^:]+): ([\s\S]*)$/;

const AMOUNT_RE = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k|K|lakh|lakhs|lac|lacs|l|L|cr|Cr)?|(?<![\d.,/:])([\d,]+(?:\.\d+)?)\s*(k|K|lakh|lakhs|lac|lacs)?(?![\d%/:])/;

const SENT_WORDS = /\b(sent|transferred|paid|bhej|bheja|bhej diya|diye|de diya|kar diya|done|credited to you|gpay kiya|transfer kiya)\b/i;
const RECEIVED_WORDS = /\b(received|got it|mil gaya|mila|aa gaya|aa gya|credited|received it|le liya)\b/i;
const CASH_WORDS = /\b(cash|nakad|nagad|haath|hand)\b/i;
const MONEY_CONTEXT = /\b(sent|transfer|paid|received|amount|cash|payment|upi|gpay|phonepe|paytm|neft|imps|bank|credited|bhej|mila|de d|le l|rs\.?|₹|inr|\d{4,})\b/i;

function parseAmountWithUnits(match) {
  const numStr = match[1] || match[3];
  const unit = (match[2] || match[4] || '').toLowerCase();
  if (!numStr) return null;
  let n = parseFloat(numStr.replace(/,/g, ''));
  if (isNaN(n) || n <= 0) return null;
  if (unit === 'k') n *= 1000;
  else if (['lakh', 'lakhs', 'lac', 'lacs', 'l'].includes(unit)) n *= 100000;
  else if (unit === 'cr') n *= 10000000;
  // Bare numbers under 100 without ₹/rs are probably not money amounts.
  if (!match[1] && n < 100) return null;
  return n;
}

export function parseWhatsAppChat(text, myNameHint = '') {
  const lines = text.replace(/\u202f/g, " ").split(/\r?\n/);
  const messages = [];
  for (const line of lines) {
    const m = line.replace(/[‎‏‪-‮]/g, '').match(MSG_RE);
    if (m) {
      messages.push({ date: parseIndianDate(m[1]), sender: m[3].trim(), text: m[4].trim() });
    } else if (messages.length && line.trim()) {
      messages[messages.length - 1].text += ' ' + line.trim();
    }
  }

  const senders = [...new Set(messages.map((m) => m.sender))];
  const me =
    senders.find((s) => myNameHint && s.toLowerCase().includes(myNameHint.toLowerCase())) || null;

  const claims = [];
  const BANK_SMS = /\b(a\/c\s*x+\d|your (account|rtgs|imps)|ref\.?\s*no|credited to .*bank|debited with rs)/i;
  const claimAmount = (text) => {
    // pick the largest plausible amount; refs/account numbers are filtered by the cap
    let best = null;
    for (const m of text.matchAll(new RegExp(AMOUNT_RE.source, 'gi'))) {
      const n = parseAmountWithUnits(m);
      if (n && n >= 100 && n <= 50000000 && (!best || n > best)) best = n;
    }
    return best;
  };
  for (const msg of messages) {
    if (!msg.date || !MONEY_CONTEXT.test(msg.text)) continue;
    // forwarded bank SMS/alerts duplicate what statements already carry
    if (BANK_SMS.test(msg.text)) continue;
    const amount = claimAmount(msg.text);
    if (!amount) continue;

    const fromMe = me ? msg.sender === me : null;
    let direction = null;
    if (SENT_WORDS.test(msg.text)) {
      // sender says they sent money
      direction = fromMe === false ? 'from_manish' : 'to_manish';
    } else if (RECEIVED_WORDS.test(msg.text)) {
      // sender says they received money
      direction = fromMe === false ? 'to_manish' : 'from_manish';
    }
    if (!direction) continue;

    claims.push({
      date: msg.date,
      sender: msg.sender,
      direction,
      amount,
      mode: CASH_WORDS.test(msg.text) ? 'cash' : 'unknown',
      text: msg.text.slice(0, 200),
    });
  }
  return { claims, senders };
}
