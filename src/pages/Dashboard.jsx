import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.js';
import { inr } from '../lib/parsers/common.js';
import { manishLedger } from '../lib/reconcile.js';
import { isInternalHead } from '../lib/selfTransfers.js';

function monthKey(date) {
  return date.slice(0, 7);
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

export default function Dashboard() {
  const state = useStore();
  const months = useMemo(() => {
    const set = new Set(state.transactions.map((t) => monthKey(t.date)));
    return [...set].sort().reverse();
  }, [state.transactions]);
  const [month, setMonth] = useState('');
  const active = month || months[0] || '';

  const txns = state.transactions.filter((t) => monthKey(t.date) === active);
  const debits = txns.filter((t) => t.direction === 'debit');
  const credits = txns.filter((t) => t.direction === 'credit');
  const sum = (arr) => arr.reduce((a, t) => a + t.amount, 0);

  const bizSpend = sum(debits.filter((t) => t.scope === 'business' && t.head !== 'Manish Transfer' && !isInternalHead(t.head)));
  const perSpend = sum(debits.filter((t) => t.scope === 'personal'));
  const unscoped = sum(debits.filter((t) => !t.scope && !isInternalHead(t.head)));
  const trancheIn = sum(credits.filter((t) => t.head === 'Investor Tranche In'));

  const byHead = {};
  for (const t of debits) {
    if (isInternalHead(t.head)) continue; // same rupee already counted where it was actually spent
    const h = t.head || '— Untagged —';
    byHead[h] = (byHead[h] || 0) + t.amount;
  }
  const headRows = Object.entries(byHead).sort((a, b) => b[1] - a[1]);
  const maxHead = headRows[0]?.[1] || 1;

  const unreviewed = state.transactions.filter((t) => !t.reviewed).length;
  const ledger = manishLedger(state.manishClaims, state.transactions);

  if (!state.transactions.length) {
    return (
      <div>
        <h1>Dashboard</h1>
        <p className="sub">Your money, bifurcated business vs personal, tagged under spend heads.</p>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Get started</h2>
          <ol style={{ marginLeft: '1.25rem', display: 'grid', gap: '0.5rem' }}>
            <li>Add your bank accounts (and the email each one is linked to) on the <Link to="/accounts">Accounts</Link> page.</li>
            <li><Link to="/import">Import</Link> a PDF or CSV bank statement — transactions get auto-tagged by rules.</li>
            <li>Review untagged transactions and hit "remember" so repeat merchants tag themselves next time.</li>
            <li>Record <Link to="/tranches">investor tranches</Link> and link incoming credits to them.</li>
            <li>Upload your WhatsApp chat export with Manish on the <Link to="/manish">Manish Ledger</Link> page to reconcile transfers (including cash).</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="spread">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Business vs personal, at a glance.</p>
        </div>
        <select value={active} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </div>

      {unreviewed > 0 && (
        <div className="notice">
          {unreviewed} transaction{unreviewed > 1 ? 's' : ''} waiting for review —{' '}
          <Link to="/transactions">tag them now</Link> so your split stays accurate.
        </div>
      )}

      <div className="grid cols-3">
        <div className="card stat">
          <div className="label">Money in — {monthLabel(active)}</div>
          <div className="value pos">{inr(sum(credits.filter((t) => !isInternalHead(t.head))))}</div>
          {trancheIn > 0 && <div className="hint">incl. {inr(trancheIn)} investor tranches</div>}
        </div>
        <div className="card stat">
          <div className="label">Business spend</div>
          <div className="value">{inr(bizSpend)}</div>
          <div className="hint">excludes Manish & self transfers</div>
        </div>
        <div className="card stat">
          <div className="label">Personal spend</div>
          <div className="value">{inr(perSpend)}</div>
          {unscoped > 0 && <div className="hint warn">{inr(unscoped)} not yet bifurcated</div>}
        </div>
        <div className="card stat">
          <div className="label">Manish — net position</div>
          <div className={'value ' + (ledger.net >= 0 ? 'pos' : 'neg')}>{inr(Math.abs(ledger.net))}</div>
          <div className="hint">{ledger.net >= 0 ? 'sent more than received' : 'received more than sent'} · <Link to="/manish">ledger</Link></div>
        </div>
      </div>

      <h2>Spend by head — {monthLabel(active)}</h2>
      <div className="card">
        <table>
          <thead>
            <tr><th>Head</th><th>Share</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {headRows.map(([head, amt]) => (
              <tr key={head}>
                <td style={{ whiteSpace: 'nowrap' }}>{head === '— Untagged —' ? <span className="warn">{head}</span> : head}</td>
                <td style={{ width: '50%' }}>
                  <div style={{ background: 'var(--accent)', opacity: 0.85, height: 10, borderRadius: 5, width: Math.max(2, (amt / maxHead) * 100) + '%' }} />
                </td>
                <td className="num">{inr(amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
