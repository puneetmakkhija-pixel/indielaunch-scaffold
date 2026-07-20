import { useMemo, useState } from 'react';
import { useStore, addTranche, removeTranche, updateTransaction } from '../lib/store.js';
import { inr } from '../lib/parsers/common.js';

export default function Tranches() {
  const state = useStore();
  const [form, setForm] = useState({ investor: '', label: '', expected: '', date: '', notes: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function add() {
    if (!form.investor || !form.expected) return;
    addTranche({ ...form, expected: parseFloat(form.expected) || 0 });
    setForm({ investor: '', label: '', expected: '', date: '', notes: '' });
  }

  // Credits that could be tranche receipts: unlinked large credits.
  const candidateCredits = useMemo(
    () =>
      state.transactions
        .filter((t) => t.direction === 'credit' && !t.trancheId && t.amount >= 10000)
        .slice(0, 50),
    [state.transactions]
  );

  const linkedByTranche = useMemo(() => {
    const map = {};
    for (const t of state.transactions) {
      if (t.trancheId) {
        if (!map[t.trancheId]) map[t.trancheId] = [];
        map[t.trancheId].push(t);
      }
    }
    return map;
  }, [state.transactions]);

  return (
    <div>
      <h1>Investor tranches</h1>
      <p className="sub">
        Track each committed tranche, link the actual bank credits when money lands, and see what's
        still pending. Keeping investor money clean is exactly what a CA would insist on.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Record a tranche</h2>
        <div className="row">
          <input placeholder="Investor name" value={form.investor} onChange={set('investor')} />
          <input placeholder="Label — e.g. Seed T2" value={form.label} onChange={set('label')} style={{ width: 140 }} />
          <input placeholder="Committed amount" type="number" value={form.expected} onChange={set('expected')} style={{ width: 160 }} />
          <input type="date" value={form.date} onChange={set('date')} title="Expected date" />
          <input placeholder="Notes" value={form.notes} onChange={set('notes')} style={{ flex: 1, minWidth: 140 }} />
          <button onClick={add}>Add</button>
        </div>
      </div>

      {state.tranches.length === 0 ? (
        <div className="card"><p className="muted">No tranches recorded yet.</p></div>
      ) : (
        state.tranches.map((tr) => {
          const linked = linkedByTranche[tr.id] || [];
          const received = linked.reduce((a, t) => a + t.amount, 0);
          const pct = tr.expected ? Math.min(100, Math.round((received / tr.expected) * 100)) : 0;
          return (
            <div className="card" key={tr.id}>
              <div className="spread">
                <div>
                  <strong>{tr.investor}</strong> {tr.label && <span className="muted">· {tr.label}</span>}
                  {tr.date && <span className="muted"> · expected {tr.date}</span>}
                  {tr.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>{tr.notes}</div>}
                </div>
                <div className="row">
                  <div style={{ textAlign: 'right' }}>
                    <div><strong>{inr(received)}</strong> <span className="muted">/ {inr(tr.expected)} ({pct}%)</span></div>
                    {received < tr.expected && <div className="warn" style={{ fontSize: '0.85rem' }}>{inr(tr.expected - received)} pending</div>}
                  </div>
                  <button className="danger small" onClick={() => removeTranche(tr.id)}>remove</button>
                </div>
              </div>
              <div style={{ background: 'var(--panel2)', borderRadius: 5, height: 8, marginTop: '0.75rem' }}>
                <div style={{ background: pct >= 100 ? 'var(--green)' : 'var(--accent)', width: pct + '%', height: 8, borderRadius: 5 }} />
              </div>
              {linked.length > 0 && (
                <table style={{ marginTop: '0.75rem' }}>
                  <tbody>
                    {linked.map((t) => (
                      <tr key={t.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                        <td className="muted">{t.narration}</td>
                        <td className="num pos">+{inr(t.amount)}</td>
                        <td><button className="danger small" onClick={() => updateTransaction(t.id, { trancheId: null })}>unlink</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })
      )}

      {state.tranches.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Link incoming credits</h2>
          {candidateCredits.length === 0 ? (
            <p className="muted">No unlinked credits ≥ ₹10,000 found. Import a statement first.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Date</th><th>Narration</th><th className="num">Amount</th><th>Tranche</th></tr>
                </thead>
                <tbody>
                  {candidateCredits.map((t) => (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td style={{ maxWidth: 380, overflowWrap: 'anywhere' }}>{t.narration}</td>
                      <td className="num pos">+{inr(t.amount)}</td>
                      <td>
                        <select
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            updateTransaction(t.id, {
                              trancheId: e.target.value,
                              head: 'Investor Tranche In',
                              scope: 'business',
                              reviewed: true,
                            });
                          }}
                        >
                          <option value="">link to…</option>
                          {state.tranches.map((tr) => (
                            <option key={tr.id} value={tr.id}>{tr.investor} {tr.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
