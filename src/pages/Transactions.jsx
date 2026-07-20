import { useMemo, useState } from 'react';
import { useStore, tagTransaction, updateTransaction, deleteTransaction, addManualTransaction } from '../lib/store.js';
import { HEAD_NAMES, defaultScopeForHead, guessMerchantToken } from '../lib/categorize.js';
import { suggestTag } from '../lib/suggest.js';
import { inr2 } from '../lib/parsers/common.js';

function TagEditor({ txn, onDone }) {
  const [head, setHead] = useState(txn.head || '');
  const [scope, setScope] = useState(txn.scope || defaultScopeForHead(txn.head) || '');
  const [remember, setRemember] = useState(false);
  const [pattern, setPattern] = useState(guessMerchantToken(txn.narration));

  function save() {
    if (!head) return;
    tagTransaction(txn.id, {
      head,
      scope: scope || null,
      rememberPattern: remember ? pattern : null,
    });
    onDone();
  }

  return (
    <div className="tag-editor">
      <div className="row">
        <select value={head} onChange={(e) => { setHead(e.target.value); setScope(defaultScopeForHead(e.target.value) || ''); }}>
          <option value="">— spend head —</option>
          {HEAD_NAMES.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">scope?</option>
          <option value="business">Business</option>
          <option value="personal">Personal</option>
        </select>
        <label className="row" style={{ gap: '0.3rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          remember for
        </label>
        {remember && (
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} style={{ width: 180 }} placeholder="match text" />
        )}
        <button className="small" onClick={save} disabled={!head}>Save</button>
        <button className="small secondary" onClick={onDone}>Cancel</button>
      </div>
      {remember && (
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
          Future transactions whose narration contains "{pattern}" will be auto-tagged {head || '…'}.
        </p>
      )}
    </div>
  );
}

function ManualEntry({ accounts, onClose }) {
  const [form, setForm] = useState({
    accountId: accounts[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    narration: '',
    amount: '',
    direction: 'debit',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function save() {
    const amount = parseFloat(form.amount);
    if (!amount || !form.narration) return;
    addManualTransaction({ ...form, amount });
    onClose();
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Add transaction (e.g. cash)</h2>
      <div className="row">
        <select value={form.accountId} onChange={set('accountId')}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <input type="date" value={form.date} onChange={set('date')} />
        <input placeholder="Description — e.g. Cash to Manish for vendor advance" value={form.narration} onChange={set('narration')} style={{ flex: 1, minWidth: 220 }} />
        <input placeholder="Amount" type="number" value={form.amount} onChange={set('amount')} style={{ width: 120 }} />
        <select value={form.direction} onChange={set('direction')}>
          <option value="debit">Paid out</option>
          <option value="credit">Received</option>
        </select>
        <button onClick={save}>Add</button>
        <button className="secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function Transactions() {
  const state = useStore();
  const [filter, setFilter] = useState('unreviewed');
  const [scopeFilter, setScopeFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [dirFilter, setDirFilter] = useState('');
  const [headFilter, setHeadFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [showManual, setShowManual] = useState(false);

  const accountsById = useMemo(
    () => Object.fromEntries(state.accounts.map((a) => [a.id, a])),
    [state.accounts]
  );

  // Similarity suggestions for untagged rows, based on what's already tagged.
  const taggedTxns = useMemo(() => state.transactions.filter((t) => t.head), [state.transactions]);
  const suggestions = useMemo(() => {
    const map = {};
    for (const t of state.transactions) {
      if (t.head) continue;
      const s = suggestTag(t, taggedTxns);
      if (s) map[t.id] = s;
    }
    return map;
  }, [state.transactions, taggedTxns]);

  function applySuggestion(t) {
    const s = suggestions[t.id];
    if (s) tagTransaction(t.id, { head: s.head, scope: s.scope });
  }

  const txns = state.transactions.filter((t) => {
    if (filter === 'unreviewed' && t.reviewed) return false;
    if (filter === 'untagged' && t.head) return false;
    if (scopeFilter && t.scope !== scopeFilter) return false;
    if (accountFilter && t.accountId !== accountFilter) return false;
    if (dirFilter && t.direction !== dirFilter) return false;
    if (headFilter === '(untagged)' ? t.head : headFilter && t.head !== headFilter) return false;
    if (search && !(t.narration || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function confirmAuto(t) {
    updateTransaction(t.id, { reviewed: true });
  }

  return (
    <div>
      <div className="spread">
        <div>
          <h1>Transactions</h1>
          <p className="sub">Review, tag under spend heads, and bifurcate business vs personal.</p>
        </div>
        <button onClick={() => setShowManual(!showManual)}>+ Manual / cash entry</button>
      </div>

      {showManual && <ManualEntry accounts={state.accounts} onClose={() => setShowManual(false)} />}

      <div className="card">
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="unreviewed">Needs review</option>
            <option value="untagged">Untagged only</option>
            <option value="all">All</option>
          </select>
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
            <option value="">Any scope</option>
            <option value="business">Business</option>
            <option value="personal">Personal</option>
          </select>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
            <option value="">All accounts</option>
            {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <select value={dirFilter} onChange={(e) => setDirFilter(e.target.value)}>
            <option value="">In & out</option>
            <option value="debit">Debits (out)</option>
            <option value="credit">Credits (in)</option>
          </select>
          <select value={headFilter} onChange={(e) => setHeadFilter(e.target.value)}>
            <option value="">Any head</option>
            <option value="(untagged)">— Untagged —</option>
            {HEAD_NAMES.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <input placeholder="Search narration…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        </div>

        {txns.length === 0 ? (
          <p className="muted">Nothing here. {filter !== 'all' && 'Try the "All" filter, or import a statement.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Account</th><th>Narration</th><th>Head</th><th>Scope</th><th className="num">Amount</th><th></th>
                </tr>
              </thead>
              <tbody>
                {txns.slice(0, 300).map((t) => (
                  <>
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{accountsById[t.accountId]?.label || '?'}</td>
                      <td style={{ maxWidth: 340, overflowWrap: 'anywhere' }}>{t.narration}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {t.head ? (
                          <>{t.head} {t.autoTagged && !t.reviewed && <span className="muted" title="auto-tagged by rule">(auto)</span>}</>
                        ) : suggestions[t.id] ? (
                          <span title={'Similar to: ' + suggestions[t.id].example}>
                            <span className="pill untagged">untagged</span>{' '}
                            <button className="small secondary" onClick={() => applySuggestion(t)}>
                              → {suggestions[t.id].head}?
                            </button>
                          </span>
                        ) : (
                          <span className="pill untagged">untagged</span>
                        )}
                      </td>
                      <td>{t.scope ? <span className={'pill ' + t.scope}>{t.scope}</span> : <span className="muted">—</span>}</td>
                      <td className={'num ' + (t.direction === 'credit' ? 'pos' : '')}>
                        {t.direction === 'credit' ? '+' : '−'}{inr2(t.amount)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {!t.reviewed && t.head && (
                          <button className="small secondary" onClick={() => confirmAuto(t)} title="Confirm the auto-tag">✓</button>
                        )}{' '}
                        <button className="small secondary" onClick={() => setEditing(editing === t.id ? null : t.id)}>Tag</button>{' '}
                        {t.source === 'manual' && (
                          <button className="danger small" onClick={() => deleteTransaction(t.id)}>✕</button>
                        )}
                      </td>
                    </tr>
                    {editing === t.id && (
                      <tr key={t.id + '-edit'}>
                        <td colSpan={7} style={{ background: 'transparent' }}>
                          <TagEditor txn={t} onDone={() => setEditing(null)} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {txns.length > 300 && <p className="muted">Showing first 300 of {txns.length} — narrow with filters.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
