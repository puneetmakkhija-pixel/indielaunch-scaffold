# Munshi — prototype model & action definitions

The domain model behind the app. State is a single JSON document persisted in
`localStorage` (`munshi_state_v1`); every mutation goes through a named action.
The same actions are exposed at runtime on `window.munshi` (see § Console API).

## 1. Entities

### Account
```ts
{
  id: string,                 // 'cash' is reserved for the built-in cash account
  label: string,              // "HDFC Current (Business)"
  bank: string,               // "HDFC" | "IndusInd" | "Kotak" | ...
  last4: string,              // used to auto-route pasted alerts
  email: string,              // the email ID this account is linked to
  type: 'bank' | 'card' | 'cash',
  limit?: number,             // card only — credit limit
  dueDay?: number,            // card only — bill due day (1-31)
  outstanding?: number,       // card only — manual override; else computed
}
```

### Transaction
```ts
{
  id: string,
  accountId: Account.id,
  date: string,               // ISO 'YYYY-MM-DD'
  narration: string,          // raw bank narration / alert counterparty
  amount: number,             // always positive
  direction: 'debit' | 'credit',
  balance?: number,           // running balance after this txn (from statement)
  head: string | null,        // spend head, from HEADS in categorize.js
  scope: 'business' | 'personal' | null,   // the bifurcation
  reviewed: boolean,          // human confirmed
  autoTagged?: boolean,       // head came from a rule, not a human
  uncertain?: boolean,        // PDF parser couldn't infer direction
  trancheId: Tranche.id | null,
  source: 'pdf' | 'csv' | 'alert' | 'whatsapp' | 'manual',
}
```
Identity for dedup: `hash = date | amount | direction | normalized(narration)`.
Re-importing an overlapping statement never duplicates rows.

### Rule
```ts
{
  id: string,
  pattern: string,            // case-insensitive substring matched on narration
  head: string,
  scope: 'business' | 'personal' | null,
  builtin?: boolean,          // pre-loaded Indian merchant rules
}
```
First matching rule wins; user rules are checked before builtin rules.

### Tranche
```ts
{
  id: string,
  investor: string,
  label: string,              // "Seed T2"
  expected: number,           // committed amount
  date?: string,              // expected date
  notes?: string,
}
```
Received amount is derived: sum of credit transactions with `trancheId = id`.

### ManishClaim  (from WhatsApp or manual entry)
```ts
{
  id: string,
  date: string,
  sender: string,
  direction: 'to_manish' | 'from_manish',
  amount: number,
  mode: 'cash' | 'unknown',
  text: string,               // the message that claimed it
  matchedTxnId: Transaction.id | null,   // reconciled bank txn
}
```

### Loan
```ts
{
  id: string,
  lender: string,
  outstanding: number,
  emi: number,                // per month
  rate: number,               // % p.a.
  emiDay?: number,
  endDate?: string,
  notes?: string,
}
```

## 2. Actions

Every action validates, mutates state immutably, persists, and notifies
subscribers. Signature → effect:

| Action | Signature | Effect |
|---|---|---|
| `addAccount` | `(acc: Partial<Account>)` | Append account (default `type:'bank'`). |
| `updateAccount` | `(id, patch)` | Shallow-merge patch. |
| `removeAccount` | `(id)` | Delete account **and its transactions** ('cash' is protected in UI). |
| `importTransactions` | `(accountId, parsed[], source)` → `{added, skipped}` | Dedup by hash, apply rules (sets `head/scope/autoTagged`), honour per-row `accountId` (alert routing), sort by date desc. |
| `addManualTransaction` | `(txn)` | Sugar over `importTransactions(source:'manual')`. |
| `updateTransaction` | `(id, patch)` | Shallow-merge (used for review-confirm, tranche linking). |
| `deleteTransaction` | `(id)` | Remove (UI restricts to manual rows). |
| `tagTransaction` | `(id, {head, scope, rememberPattern?})` | Set head+scope, mark reviewed. If `rememberPattern`: create rule (dedup by pattern) and retro-apply to untagged, unreviewed rows. |
| `addRule` / `removeRule` | `(rule)` / `(id)` | Maintain rule list; new rules are checked first. |
| `addTranche` / `removeTranche` | `(tranche)` / `(id)` | Remove also unlinks its transactions. |
| `addManishClaims` | `(claims[])` → `added` | Dedup by `(date, amount, text)`. |
| `updateManishClaim` / `removeManishClaim` | `(id, patch)` / `(id)` | Reconciliation bookkeeping. |
| `addLoan` / `updateLoan` / `removeLoan` | `(loan)` / `(id, patch)` / `(id)` | Loan register. |
| `exportAll` / `importAll` | `()` → json / `(json)` | Full backup / restore. |

## 3. Derived views (pure functions, no state)

| Function | Module | Output |
|---|---|---|
| `applyRules(narration, rules)` | categorize | `{head, scope, ruleId}` or null |
| `suggestTag(txn, tagged[])` | suggest | most-similar tagged txn's `{head, scope, score}` |
| `monthlyTurnover(txns)` | analysis | credits/debits/net per month |
| `averageBalance(txns, accountId, days)` | analysis | EOD carry-forward average |
| `detectBounces / detectEmis / detectRecurring` | analysis | CA red-flag lists |
| `autoMatchClaims(claims, txns)` | reconcile | WhatsApp claim ↔ bank txn matches |
| `manishLedger(claims, txns)` | reconcile | sent/received/net + entry list |
| `cardOutstanding(txns, account)` | advice | card balance (manual override wins) |
| `computeAdvice({accounts, transactions, loans})` | advice | ranked savings guidance |

## 4. Parsers (input adapters)

| Parser | Input | Output |
|---|---|---|
| `parsePdfStatement(buf, password?)` | statement PDF | txn rows (+balance), direction via balance-delta |
| `parseCsvStatement(text)` | netbanking CSV | txn rows (+balance), header auto-detected |
| `parseAlerts(text)` | pasted alert emails/SMS | txn rows + `last4` for account routing |
| `parseWhatsAppChat(text, myName)` | WhatsApp export .txt | ManishClaims + sender list |

## 5. Console API (`window.munshi`)

Open DevTools (F12) on the running app:

```js
munshi.help()                                  // list everything below
munshi.state                                   // live state snapshot
munshi.actions.addLoan({lender:'Bajaj', emi:15000, rate:16, outstanding:300000})
munshi.actions.tagTransaction(id, {head:'SaaS & Software', scope:'business', rememberPattern:'AWS'})
munshi.analyze.turnover()                      // monthlyTurnover(state.transactions)
munshi.analyze.advice()                        // computeAdvice(state)
munshi.analyze.recurring()                     // repetitive spends
munshi.parse.alerts('Rs.449.00 debited from a/c **1234 on 01-07-26 to VPA swiggy@ybl')
munshi.backup()                                // download JSON backup
```

Everything callable in the UI is callable here — the UI is just one client of
the action layer, which is what makes the model portable to a future backend.
