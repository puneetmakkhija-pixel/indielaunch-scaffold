import { useMemo, useState } from 'react';
import {
  useStore,
  addManishClaims,
  updateManishClaim,
  removeManishClaim,
} from '../lib/store.js';
import { parseWhatsAppChat } from '../lib/parsers/whatsapp.js';
import { autoMatchClaims, manishLedger } from '../lib/reconcile.js';
import { inr } from '../lib/parsers/common.js';

export default function Manish() {
  const state = useStore();
  const [myName, setMyName] = useState('');
  const [error, setError] = useState('');
  const [lastImport, setLastImport] = useState(null);
  const [claimForm, setClaimForm] = useState({ date: new Date().toISOString().slice(0, 10), direction: 'to_manish', amount: '', mode: 'cash', text: '' });

  const ledger = useMemo(
    () => manishLedger(state.manishClaims, state.transactions),
    [state.manishClaims, state.transactions]
  );

  async function handleChat(file) {
    setError('');
    try {
      const text = await file.text();
      const { claims, senders } = parseWhatsAppChat(text, myName);
      if (!claims.length) {
        throw new Error(
          `No money messages detected. Senders found: ${senders.join(', ') || 'none'}. ` +
          'Make sure this is a WhatsApp "Export chat" .txt file and your name matches a sender.'
        );
      }
      const added = addManishClaims(claims);
      // Auto-reconcile fresh claims against bank transactions.
      const matches = autoMatchClaims(
        [...state.manishClaims, ...claims.map((c, i) => ({ ...c, id: 'pending' + i }))].filter((c) => !c.matchedTxnId),
        state.transactions
      );
      setLastImport({ found: claims.length, added, matched: matches.length });
      runAutoMatch();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  function runAutoMatch() {
    const updates = autoMatchClaims(state.manishClaims, state.transactions);
    for (const u of updates) updateManishClaim(u.claimId, { matchedTxnId: u.txnId });
    return updates.length;
  }

  function addClaim() {
    const amount = parseFloat(claimForm.amount);
    if (!amount) return;
    addManishClaims([{ ...claimForm, amount, sender: 'manual' }]);
    setClaimForm({ ...claimForm, amount: '', text: '' });
  }

  const unmatched = state.manishClaims.filter((c) => !c.matchedTxnId && c.mode !== 'cash');
  const cashClaims = state.manishClaims.filter((c) => c.mode === 'cash');

  return (
    <div>
      <h1>Manish ledger</h1>
      <p className="sub">
        Every rupee between you and Manish — bank, UPI, and cash — reconciled against what you two
        wrote on WhatsApp. Unmatched claims are your missing paper trail.
      </p>

      <div className="grid cols-3">
        <div className="card stat">
          <div className="label">You sent Manish</div>
          <div className="value">{inr(ledger.sent)}</div>
        </div>
        <div className="card stat">
          <div className="label">Manish sent you</div>
          <div className="value">{inr(ledger.received)}</div>
        </div>
        <div className="card stat">
          <div className="label">Net position</div>
          <div className={'value ' + (ledger.net >= 0 ? 'pos' : 'neg')}>{inr(Math.abs(ledger.net))}</div>
          <div className="hint">{ledger.net >= 0 ? 'in Manish’s hands' : 'owed to Manish side'}</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Import WhatsApp chat</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          In WhatsApp: open the chat with Manish → ⋮ → More → <strong>Export chat → Without media</strong>,
          then upload the .txt here. Messages like "sent 50k", "bhej diya 25000", "cash de diya" are
          picked up automatically.
        </p>
        <div className="row">
          <label className="field" style={{ margin: 0 }}>
            <span>Your name in the chat</span>
            <input value={myName} onChange={(e) => setMyName(e.target.value)} style={{ width: 140 }} />
          </label>
          <label className="dropzone" style={{ flex: 1, minWidth: 220 }}>
            Click to choose the exported .txt
            <input type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && handleChat(e.target.files[0])} />
          </label>
          <button className="secondary" onClick={() => alert(runAutoMatch() + ' claim(s) matched to bank transactions.')}>
            Re-run matching
          </button>
        </div>
        {error && <div className="notice" style={{ marginTop: '0.75rem' }}>{error}</div>}
        {lastImport && (
          <div className="notice good" style={{ marginTop: '0.75rem' }}>
            Found {lastImport.found} money messages, added {lastImport.added} new claims.
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add a claim manually (e.g. cash handover)</h2>
        <div className="row">
          <input type="date" value={claimForm.date} onChange={(e) => setClaimForm({ ...claimForm, date: e.target.value })} />
          <select value={claimForm.direction} onChange={(e) => setClaimForm({ ...claimForm, direction: e.target.value })}>
            <option value="to_manish">I gave Manish</option>
            <option value="from_manish">Manish gave me</option>
          </select>
          <input type="number" placeholder="Amount" value={claimForm.amount} onChange={(e) => setClaimForm({ ...claimForm, amount: e.target.value })} style={{ width: 130 }} />
          <select value={claimForm.mode} onChange={(e) => setClaimForm({ ...claimForm, mode: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="unknown">Bank/UPI</option>
          </select>
          <input placeholder="Note" value={claimForm.text} onChange={(e) => setClaimForm({ ...claimForm, text: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
          <button onClick={addClaim}>Add</button>
        </div>
      </div>

      {unmatched.length > 0 && (
        <div className="notice">
          {unmatched.length} non-cash claim{unmatched.length > 1 ? 's' : ''} from WhatsApp have no matching bank
          transaction yet — either the statement covering those dates isn't imported, or the money moved
          through an account you haven't added.
        </div>
      )}
      {cashClaims.length > 0 && (
        <div className="notice">
          {cashClaims.length} cash movement{cashClaims.length > 1 ? 's' : ''} on record. Cash between you and
          Manish involving investor money should be backed by a signed voucher — ask your CA for a simple
          format.
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Full ledger</h2>
        {ledger.entries.length === 0 ? (
          <p className="muted">
            Nothing yet. Import bank statements (transactions tagged "Manish Transfer" appear here) and
            the WhatsApp chat.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Date</th><th>Direction</th><th>Via</th><th>Detail</th><th className="num">Amount</th><th></th></tr>
              </thead>
              <tbody>
                {ledger.entries.map((e) => (
                  <tr key={e.kind + e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{e.direction === 'to_manish' ? '→ to Manish' : '← from Manish'}</td>
                    <td>
                      {e.kind === 'bank' && <span className="pill credit">bank</span>}
                      {e.kind === 'cash' && <span className="pill cash">cash</span>}
                      {e.kind === 'claim' && <span className="pill untagged">unmatched</span>}
                    </td>
                    <td style={{ maxWidth: 380, overflowWrap: 'anywhere' }} className="muted">{e.label}</td>
                    <td className="num">{inr(e.amount)}</td>
                    <td>
                      {e.kind !== 'bank' && (
                        <button className="danger small" onClick={() => removeManishClaim(e.id)}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
