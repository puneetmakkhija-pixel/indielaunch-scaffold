// Spend heads with a sensible default scope (business / personal).
// Scope can always be overridden per-transaction.
export const HEADS = [
  { name: 'Investor Tranche In', scope: 'business', credit: true },
  { name: 'Return to Investor', scope: 'business' },
  { name: 'Salary', scope: 'personal', credit: true },
  { name: 'DSA Commission', scope: 'business', credit: true },
  { name: 'Sub-DSA Investment', scope: 'business' },
  { name: 'Revenue / Client Payment', scope: 'business', credit: true },
  { name: 'Refund / Reversal', scope: null, credit: true },
  { name: 'Manish Transfer', scope: 'business' },
  { name: 'Salaries & Contractors', scope: 'business' },
  { name: 'Vendor Payment', scope: 'business' },
  { name: 'Rent (Office)', scope: 'business' },
  { name: 'SaaS & Software', scope: 'business' },
  { name: 'Marketing & Ads', scope: 'business' },
  { name: 'Professional Fees (CA/Legal)', scope: 'business' },
  { name: 'GST / Taxes', scope: 'business' },
  { name: 'Bank Charges', scope: 'business' },
  { name: 'Office Expenses', scope: 'business' },
  { name: 'Business Travel', scope: 'business' },
  { name: 'Rent (Home)', scope: 'personal' },
  { name: 'Food & Dining', scope: 'personal' },
  { name: 'Groceries', scope: 'personal' },
  { name: 'Shopping', scope: 'personal' },
  { name: 'Travel & Commute', scope: 'personal' },
  { name: 'Fuel', scope: 'personal' },
  { name: 'Utilities & Telecom', scope: 'personal' },
  { name: 'Entertainment & OTT', scope: 'personal' },
  { name: 'Medical & Health', scope: 'personal' },
  { name: 'Household (Wife)', scope: 'personal' },
  { name: 'Education (Kids)', scope: 'personal' },
  { name: 'Family & Gifts', scope: 'personal' },
  { name: 'EMI & Loans', scope: 'personal' },
  { name: 'Insurance', scope: 'personal' },
  { name: 'Investments (Personal)', scope: 'personal' },
  { name: 'Cash Withdrawal', scope: null },
  { name: 'Self Transfer', scope: null },
  { name: 'Card Bill Payment', scope: null },
  { name: 'Other', scope: null },
];

export const HEAD_NAMES = HEADS.map((h) => h.name);

export function defaultScopeForHead(head) {
  return HEADS.find((h) => h.name === head)?.scope ?? null;
}

// Starter rules for narrations commonly seen in Indian bank statements.
// pattern is a case-insensitive substring matched against the narration.
export const DEFAULT_RULES = [
  { pattern: 'SWIGGY', head: 'Food & Dining', scope: 'personal' },
  { pattern: 'ZOMATO', head: 'Food & Dining', scope: 'personal' },
  { pattern: 'BLINKIT', head: 'Groceries', scope: 'personal' },
  { pattern: 'ZEPTO', head: 'Groceries', scope: 'personal' },
  { pattern: 'BIGBASKET', head: 'Groceries', scope: 'personal' },
  { pattern: 'AMAZON', head: 'Shopping', scope: 'personal' },
  { pattern: 'FLIPKART', head: 'Shopping', scope: 'personal' },
  { pattern: 'MYNTRA', head: 'Shopping', scope: 'personal' },
  { pattern: 'UBER', head: 'Travel & Commute', scope: 'personal' },
  { pattern: 'OLA', head: 'Travel & Commute', scope: 'personal' },
  { pattern: 'RAPIDO', head: 'Travel & Commute', scope: 'personal' },
  { pattern: 'IRCTC', head: 'Travel & Commute', scope: 'personal' },
  { pattern: 'INDIGO', head: 'Business Travel', scope: 'business' },
  { pattern: 'MAKEMYTRIP', head: 'Business Travel', scope: 'business' },
  { pattern: 'JIO', head: 'Utilities & Telecom', scope: 'personal' },
  { pattern: 'AIRTEL', head: 'Utilities & Telecom', scope: 'personal' },
  { pattern: 'BESCOM', head: 'Utilities & Telecom', scope: 'personal' },
  { pattern: 'NETFLIX', head: 'Entertainment & OTT', scope: 'personal' },
  { pattern: 'SPOTIFY', head: 'Entertainment & OTT', scope: 'personal' },
  { pattern: 'HOTSTAR', head: 'Entertainment & OTT', scope: 'personal' },
  { pattern: 'APOLLO', head: 'Medical & Health', scope: 'personal' },
  { pattern: 'PHARMEASY', head: 'Medical & Health', scope: 'personal' },
  { pattern: 'AWS', head: 'SaaS & Software', scope: 'business' },
  { pattern: 'GOOGLE CLOUD', head: 'SaaS & Software', scope: 'business' },
  { pattern: 'GOOGLE*GSUITE', head: 'SaaS & Software', scope: 'business' },
  { pattern: 'GODADDY', head: 'SaaS & Software', scope: 'business' },
  { pattern: 'RAZORPAY', head: 'Revenue / Client Payment', scope: 'business' },
  { pattern: 'FACEBK', head: 'Marketing & Ads', scope: 'business' },
  { pattern: 'GOOGLE ADS', head: 'Marketing & Ads', scope: 'business' },
  { pattern: 'GSTIN', head: 'GST / Taxes', scope: 'business' },
  { pattern: 'INCOME TAX', head: 'GST / Taxes', scope: 'business' },
  { pattern: 'ATM WDL', head: 'Cash Withdrawal', scope: null },
  { pattern: 'ATW-', head: 'Cash Withdrawal', scope: null },
  { pattern: 'NWD-', head: 'Cash Withdrawal', scope: null },
  { pattern: 'LIC OF INDIA', head: 'Insurance', scope: 'personal' },
  { pattern: 'ZERODHA', head: 'Investments (Personal)', scope: 'personal' },
  { pattern: 'GROWW', head: 'Investments (Personal)', scope: 'personal' },
  { pattern: 'INDIAN CLEARING CORP', head: 'Investments (Personal)', scope: 'personal' },
  { pattern: 'NACH', head: 'EMI & Loans', scope: 'personal' },
  { pattern: 'ECS DR', head: 'EMI & Loans', scope: 'personal' },
  { pattern: 'SMS CHRG', head: 'Bank Charges', scope: 'business' },
  { pattern: 'AMB CHRG', head: 'Bank Charges', scope: 'business' },
  { pattern: 'CRED CLUB', head: 'Card Bill Payment', scope: null },
  { pattern: 'CC PAYMENT', head: 'Card Bill Payment', scope: null },
  { pattern: 'CREDIT CARD PAYMENT', head: 'Card Bill Payment', scope: null },
  { pattern: 'SWEEP TRANSFER TO', head: 'Self Transfer', scope: null },
  { pattern: 'SWEEP TRF FROM', head: 'Self Transfer', scope: null },
  { pattern: 'FD PREMAT PROCEEDS', head: 'Self Transfer', scope: null },
  { pattern: 'ETAX GSTN', head: 'GST / Taxes', scope: 'business' },
  { pattern: 'BSES', head: 'Utilities & Telecom', scope: 'business' },
  { pattern: 'MMTC', head: 'Investments (Personal)', scope: 'personal' },
  // Card-statement interest & fee lines
  { pattern: 'FINANCE CHARGES', head: 'Bank Charges', scope: 'personal' },
  { pattern: 'FINANCE CHARGE', head: 'Bank Charges', scope: 'personal' },
  { pattern: 'FOREIGN CURRENCY MARKUP', head: 'Bank Charges', scope: 'personal' },
  { pattern: 'IGST', head: 'Bank Charges', scope: 'personal' },
  { pattern: 'GST @ 18%', head: 'Bank Charges', scope: 'personal' },
  { pattern: 'INSTALLMENT PRINCIPAL', head: 'EMI & Loans', scope: 'personal' },
  { pattern: 'CRED.CLUB', head: 'Card Bill Payment', scope: null },
  { pattern: 'SHRIRAM', head: 'EMI & Loans', scope: 'personal' },
  { pattern: 'LAZY', head: 'EMI & Loans', scope: 'personal' },
  { pattern: 'NFS CASH', head: 'Cash Withdrawal', scope: null },
  { pattern: 'APPLE', head: 'Entertainment & OTT', scope: 'personal' },
  // Apple's UPI collect handle (s.bdsi@ / appleservices.bdsi@)
  { pattern: '.BDSI@', head: 'Entertainment & OTT', scope: 'personal' },
  { pattern: 'GOOGLE PLAY', head: 'Entertainment & OTT', scope: 'personal' },
  // Netflix's UPI handle rows come through as "Netf" (never matches NEFT)
  { pattern: 'NETF', head: 'Entertainment & OTT', scope: 'personal' },
  { pattern: 'PVR', head: 'Entertainment & OTT', scope: 'personal' },
  // Blinkit collects via this Razorpay handle
  { pattern: 'IT.RZP@', head: 'Groceries', scope: 'personal' },
  { pattern: 'ANTHROPIC', head: 'SaaS & Software', scope: 'business' },
  { pattern: 'ZOHO', head: 'SaaS & Software', scope: 'business' },
  { pattern: 'TWILIO', head: 'SaaS & Software', scope: 'business' },
  { pattern: 'MICROSOFT', head: 'SaaS & Software', scope: 'business' },
  { pattern: 'GOOGLE WORKSPACE', head: 'SaaS & Software', scope: 'business' },
].map((r, i) => ({ id: 'default-' + i, builtin: true, ...r }));
// Person-specific rules (your employer, ledger partner, family, vendors) are
// data, not code: they live in your restored backup, never in this repo.

// Apply the first matching rule to a transaction. Rules may be scoped to one
// account via rule.accountId (e.g. the same payer can mean salary in one
// account and commission in another). Returns {head, scope} or null.
// Rules may also be scoped to one direction via rule.direction (e.g. money
// TO a counterparty is a return, money FROM them is a receipt).
export function applyRules(narration, rules, accountId = null, direction = null) {
  const hay = (narration || '').toUpperCase();
  for (const r of rules) {
    if (r.accountId && r.accountId !== accountId) continue;
    if (r.direction && direction && r.direction !== direction) continue;
    if (r.pattern && hay.includes(r.pattern.toUpperCase())) {
      return { head: r.head, scope: r.scope ?? defaultScopeForHead(r.head), ruleId: r.id };
    }
  }
  return null;
}

// Guess the merchant/counterparty token from a bank narration, used to
// pre-fill the "remember this" rule pattern.
// e.g. "UPI-SWIGGY LIMITED-swiggy@axb-..." -> "SWIGGY LIMITED"
export function guessMerchantToken(narration) {
  if (!narration) return '';
  const n = narration.trim();
  const upiMatch = n.match(/^(?:UPI|IMPS|NEFT|RTGS)[-/ ]+([A-Za-z][A-Za-z0-9 .&'()]{2,40}?)(?:[-/]|$)/i);
  if (upiMatch) return upiMatch[1].trim().toUpperCase();
  const words = n
    .replace(/[0-9]{4,}/g, ' ')
    .split(/[-/|@]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4 && /[A-Za-z]{3,}/.test(s) && !/^(UPI|IMPS|NEFT|RTGS|POS|TXN|REF|PAYMENT|TRANSFER)$/i.test(s));
  return (words[0] || n.slice(0, 20)).toUpperCase();
}
