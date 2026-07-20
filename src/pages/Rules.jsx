import { useState } from 'react';
import { useStore, addRule, removeRule } from '../lib/store.js';
import { HEAD_NAMES, defaultScopeForHead } from '../lib/categorize.js';

export default function Rules() {
  const state = useStore();
  const [pattern, setPattern] = useState('');
  const [head, setHead] = useState(HEAD_NAMES[0]);
  const [scope, setScope] = useState('business');

  function add() {
    if (!pattern.trim()) return;
    addRule({ pattern: pattern.trim(), head, scope: scope || defaultScopeForHead(head) });
    setPattern('');
  }

  const custom = state.rules.filter((r) => !r.builtin);
  const builtin = state.rules.filter((r) => r.builtin);

  return (
    <div>
      <h1>Auto-tagging rules</h1>
      <p className="sub">
        When an imported transaction's narration contains the match text, it's tagged automatically.
        Rules are how the accountant "remembers" your repetitive spends — the more you teach it, the
        less you review.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add rule</h2>
        <div className="row">
          <input placeholder='Match text, e.g. "RAZORPAY SOFTWARE"' value={pattern} onChange={(e) => setPattern(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <select value={head} onChange={(e) => { setHead(e.target.value); setScope(defaultScopeForHead(e.target.value) || ''); }}>
            {HEAD_NAMES.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">no scope</option>
            <option value="business">Business</option>
            <option value="personal">Personal</option>
          </select>
          <button onClick={add}>Add</button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Your rules ({custom.length})</h2>
        {custom.length === 0 ? (
          <p className="muted">None yet — tag a transaction and tick "remember for" to create one.</p>
        ) : (
          <RuleTable rules={custom} removable />
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Built-in rules ({builtin.length})</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>Common Indian merchants, pre-loaded. Your rules take priority — they're checked first.</p>
        <RuleTable rules={builtin} removable />
      </div>
    </div>
  );
}

function RuleTable({ rules, removable }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr><th>Match text</th><th>Head</th><th>Scope</th>{removable && <th></th>}</tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td><code>{r.pattern}</code></td>
              <td>{r.head}</td>
              <td>{r.scope ? <span className={'pill ' + r.scope}>{r.scope}</span> : <span className="muted">—</span>}</td>
              {removable && (
                <td><button className="danger small" onClick={() => removeRule(r.id)}>remove</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
