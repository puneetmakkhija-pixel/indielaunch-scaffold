import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.js';
import { inr } from '../lib/parsers/common.js';
import { isInternalHead, tokensToRegex } from '../lib/selfTransfers.js';

function monthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function Bars({ rows, color }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div>
      {rows.map(([label, amt, untagged]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 90px', gap: 10, alignItems: 'center', padding: '3px 0', fontSize: '0.85rem' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
            {label} {untagged && <span className="warn">?</span>}
          </div>
          <div style={{ background: color, opacity: untagged ? 0.45 : 0.85, height: 11, borderRadius: '0 4px 4px 0', width: Math.max(1.5, (amt / max) * 100) + '%' }} />
          <div className="muted" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(amt)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Monthly() {
  const state = useStore();
  const months = useMemo(
    () => [...new Set(state.transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(),
    [state.transactions]
  );
  const [sel, setSel] = useState('');
  const m = sel || months[0] || '';

  const txns = state.transactions.filter((t) => t.date.startsWith(m));
  const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const sum = (arr) => arr.reduce((a, t) => a + t.amount, 0);

  // per-account table
  const perAccount = useMemo(() => {
    const map = {};
    for (const t of txns) {
      if (!map[t.accountId]) map[t.accountId] = { in: 0, out: 0, n: 0 };
      map[t.accountId][t.direction === 'credit' ? 'in' : 'out'] += t.amount;
      map[t.accountId].n++;
    }
    return Object.entries(map).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
  }, [txns]);

  // spend & income by head (internal movements excluded — sweeps, A→B self
  // transfers and card bill payments are the same rupee counted twice)
  const flows = txns.filter((t) => !isInternalHead(t.head));
  const agg = (dir) => {
    const g = {};
    for (const t of flows.filter((t) => t.direction === dir)) {
      const untagged = !t.head;
      const key = t.head || (t.narration || '').slice(0, 26);
      if (!g[key]) g[key] = [key, 0, untagged];
      g[key][1] += t.amount;
    }
    return Object.values(g).sort((a, b) => b[1] - a[1]).slice(0, 12);
  };

  // Manish month reconciliation. Partner identity comes from the restored
  // profile (tokens & account numbers stay in your data, not in this repo).
  const partnerRe = tokensToRegex(state.profile?.partnerTokens);
  const excludeRe = tokensToRegex(state.profile?.partnerExclude);
  const manishTxns = txns
    .filter((t) => {
      const n = t.narration || '';
      if (excludeRe && excludeRe.test(n)) return false;
      return t.head === 'Manish Transfer' || t.manishSide || (partnerRe && partnerRe.test(n));
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const manishOut = sum(manishTxns.filter((t) => t.direction === 'debit'));
  const manishIn = sum(manishTxns.filter((t) => t.direction === 'credit'));
  const claims = state.manishClaims.filter((c) => c.date && c.date.startsWith(m));

  if (!months.length) {
    return (
      <div>
        <h1>Monthly reconciliation</h1>
        <div className="card"><p className="muted"><Link to="/import">Import statements</Link> to see month-wise reconciliation.</p></div>
      </div>
    );
  }

  return (
    <div>
      <div className="spread">
        <div>
          <h1>Monthly reconciliation</h1>
          <p className="sub">One month, every account, fully bifurcated — with the Manish ledger for the month.</p>
        </div>
        <select value={m} onChange={(e) => setSel(e.target.value)}>
          {months.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
        </select>
      </div>

      <div className="grid cols-3">
        <div className="card stat">
          <div className="label">Money in — {monthLabel(m)}</div>
          <div className="value pos">{inr(sum(flows.filter((t) => t.direction === 'credit')))}</div>
          <div className="hint">self transfers & card bill payments excluded</div>
        </div>
        <div className="card stat">
          <div className="label">Money out</div>
          <div className="value">{inr(sum(flows.filter((t) => t.direction === 'debit')))}</div>
        </div>
        <div className="card stat">
          <div className="label">Manish — this month</div>
          <div className="value">{inr(manishOut - manishIn)}</div>
          <div className="hint">{inr(manishOut)} out · {inr(manishIn)} back</div>
        </div>
      </div>

      <h2>Accounts &amp; cards</h2>
      <div className="card">
        <table>
          <thead><tr><th>Account</th><th className="num">Txns</th><th className="num">In</th><th className="num">Out</th><th className="num">Net</th></tr></thead>
          <tbody>
            {perAccount.map(([id, v]) => (
              <tr key={id}>
                <td>{accountsById[id]?.label || id}</td>
                <td className="num">{v.n}</td>
                <td className="num pos">{inr(v.in)}</td>
                <td className="num">{inr(v.out)}</td>
                <td className={'num ' + (v.in - v.out >= 0 ? 'pos' : 'neg')}>{inr(v.in - v.out)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Where it went <span className="muted" style={{ fontWeight: 400 }}>(? = untagged — <Link to="/transactions">classify</Link>)</span></h2>
      <div className="card"><Bars rows={agg('debit')} color="var(--accent)" /></div>

      <h2>Where it came from</h2>
      <div className="card"><Bars rows={agg('credit')} color="var(--green)" /></div>

      <h2>Manish — {monthLabel(m)}</h2>
      <div className="card">
        {manishTxns.length === 0 ? (
          <p className="muted">No bank transfers with Manish this month.</p>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Account</th><th>Dir</th><th className="num">Amount</th><th>Narration</th></tr></thead>
            <tbody>
              {manishTxns.map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                  <td className="muted">{accountsById[t.accountId]?.label?.split(' ')[0] || t.accountId}</td>
                  <td>{t.direction === 'debit' ? <span className="pill debit">→ to him</span> : <span className="pill credit">← back</span>}</td>
                  <td className="num">{inr(t.amount)}</td>
                  <td className="muted" style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>{t.narration.slice(0, 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {claims.length > 0 && (
          <>
            <h2 style={{ marginTop: '1rem' }}>WhatsApp claims this month</h2>
            <table>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.date}</td>
                    <td>{c.direction === 'to_manish' ? '→' : '←'} {inr(c.amount)}</td>
                    <td>{c.matchedTxnId ? <span className="pill credit">matched</span> : c.mode === 'cash' ? <span className="pill cash">cash — no bank trail</span> : <span className="pill untagged">unmatched</span>}</td>
                    <td className="muted" style={{ maxWidth: 340, overflowWrap: 'anywhere' }}>{(c.text || '').slice(0, 70)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
