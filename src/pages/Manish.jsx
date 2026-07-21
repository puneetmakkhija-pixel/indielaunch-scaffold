import { useMemo, useState, useRef, useEffect } from 'react';
import {
  useStore,
  addManishClaims,
  updateManishClaim,
  removeManishClaim,
} from '../lib/store.js';
import { parseWhatsAppChat } from '../lib/parsers/whatsapp.js';
import { autoMatchClaims, manishLedger } from '../lib/reconcile.js';
import { inr } from '../lib/parsers/common.js';

function monthName(key) {
  const [y, m] = key.split('-');
  return new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

export default function Manish() {
  const state = useStore();
  const [myName, setMyName] = useState('');
  const [error, setError] = useState('');
  const [lastImport, setLastImport] = useState(null);
  const [claimForm, setClaimForm] = useState({ date: new Date().toISOString().slice(0, 10), direction: 'to_manish', amount: '', mode: 'cash', text: '' });

  const ledger = useMemo(
    () => manishLedger(state.manishClaims, state.transactions, state.manishAnchor),
    [state.manishClaims, state.transactions, state.manishAnchor]
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

  const accountsById = useMemo(() => Object.fromEntries(state.accounts.map((a) => [a.id, a])), [state.accounts]);
  const txnSource = useMemo(() => Object.fromEntries(state.transactions.map((t) => [t.id, t.source])), [state.transactions]);

  // Date-synced reconciliation: every bank transaction (all accounts except
  // credit cards) on the left, the full WhatsApp chat with screenshot markers
  // on the right — merged into one row per date so the two sides stay aligned.
  const SINCE = '2026-01';
  const bankAll = useMemo(
    () =>
      state.transactions.filter((t) => {
        const acc = accountsById[t.accountId];
        return acc && acc.type !== 'card' && (t.date || '') >= SINCE;
      }),
    [state.transactions, accountsById]
  );
  const chatAll = useMemo(
    () => (state.chatMessages || []).filter((m) => (m.date || '') >= SINCE),
    [state.chatMessages]
  );
  const reconMonths = useMemo(
    () => [...new Set([...bankAll.map((t) => t.date.slice(0, 7)), ...chatAll.map((m) => m.date.slice(0, 7))])].filter(Boolean).sort(),
    [bankAll, chatAll]
  );
  const [reconMonth, setReconMonth] = useState('');
  const activeReconMonth = reconMonth || reconMonths[reconMonths.length - 1] || '';
  // Build date → { bank[], chat[] } for the selected month, chronological.
  const reconDays = useMemo(() => {
    const map = {};
    for (const t of bankAll) {
      if (!t.date.startsWith(activeReconMonth)) continue;
      (map[t.date] = map[t.date] || { bank: [], chat: [] }).bank.push(t);
    }
    for (const m of chatAll) {
      if (!m.date.startsWith(activeReconMonth)) continue;
      (map[m.date] = map[m.date] || { bank: [], chat: [] }).chat.push(m);
    }
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [bankAll, chatAll, activeReconMonth]);
  const attachIcon = (a) => (a === 'photo' ? '📷 screenshot' : a === 'audio' ? '🎤 voice note' : a === 'doc' ? '📄 file' : a === 'call' ? '📞 call' : a ? '📎 ' + a : '');

  // Local media: point the app at your exported WhatsApp media folder once per
  // session. Files never leave the browser — we only build in-memory object
  // URLs keyed by filename, so referenced screenshots and voice notes render
  // inline. Cleared on reload.
  const [media, setMedia] = useState({});
  const urlsRef = useRef([]);
  function loadMedia(fileList) {
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current = [];
    const map = {};
    for (const f of fileList) {
      const url = URL.createObjectURL(f);
      urlsRef.current.push(url);
      map[f.name] = url;
    }
    setMedia(map);
  }
  useEffect(() => () => { for (const u of urlsRef.current) URL.revokeObjectURL(u); }, []);
  const mediaCount = Object.keys(media).length;

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
          <div className="label">{ledger.youOwe != null ? 'Settlement' : 'Net position'}</div>
          {ledger.youOwe != null ? (
            <>
              <div className={'value ' + (ledger.youOwe > 0 ? 'neg' : 'pos')}>{inr(Math.abs(ledger.youOwe))}</div>
              <div className="hint">{ledger.youOwe > 0 ? 'you owe Manish' : 'Manish owes you'}</div>
            </>
          ) : (
            <>
              <div className={'value ' + (ledger.net >= 0 ? 'pos' : 'neg')}>{inr(Math.abs(ledger.net))}</div>
              <div className="hint">{ledger.net >= 0 ? 'in Manish’s hands' : 'owed to Manish side'}</div>
            </>
          )}
        </div>
      </div>

      {ledger.anchor && (
        <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <h2 style={{ marginTop: 0, marginBottom: '0.4rem' }}>How the settlement is worked out</h2>
          <table>
            <tbody>
              <tr><td>Agreed balance on {ledger.anchor.date}</td><td className="num">{inr(ledger.anchor.youOwe)} you owed</td></tr>
              <tr><td>− You paid his side since then</td><td className="num neg">− {inr(ledger.postSent)}</td></tr>
              <tr><td>+ Received from his side since then</td><td className="num pos">+ {inr(ledger.postReceived)}</td></tr>
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, rgba(128,128,128,0.4))' }}>
                <td>{ledger.youOwe > 0 ? 'You owe Manish' : 'Manish owes you'}</td>
                <td className={'num ' + (ledger.youOwe > 0 ? 'neg' : 'pos')}>{inr(Math.abs(ledger.youOwe))}</td>
              </tr>
            </tbody>
          </table>
          {ledger.anchor.note && <p className="muted" style={{ marginBottom: 0, marginTop: '0.5rem' }}>{ledger.anchor.note}</p>}
        </div>
      )}

      <div className="card">
        <div className="spread" style={{ marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Bank statement ⇄ WhatsApp chat</h2>
          <select value={activeReconMonth} onChange={(e) => setReconMonth(e.target.value)}>
            {reconMonths.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </div>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          Every bank movement (all accounts except credit cards) beside the day's WhatsApp messages
          and screenshots — one row per date, the two sides always in sync. Page through month by
          month from January.
        </p>
        <div className="row" style={{ marginBottom: '0.75rem', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label className="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.7rem', border: '1px solid var(--border, rgba(128,128,128,0.3))', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
            📎 Load WhatsApp media
            <input type="file" multiple accept="image/*,audio/*" style={{ display: 'none' }} onChange={(e) => e.target.files.length && loadMedia(e.target.files)} />
          </label>
          {mediaCount > 0
            ? <span className="pill credit">{mediaCount} media files loaded — screenshots &amp; voice notes now open inline</span>
            : <span className="muted" style={{ fontSize: '0.82rem' }}>Export the chat <strong>with media</strong>, then pick those image/audio files here. They stay on your device — nothing is uploaded.</span>}
        </div>
        {reconDays.length === 0 ? (
          <p className="muted">Nothing for this month. Restore a backup with chat + statements loaded.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 92 }}>Date</th>
                  <th style={{ width: '46%' }}>🏦 Bank (all except cards)</th>
                  <th>💬 WhatsApp — chat &amp; screenshots</th>
                </tr>
              </thead>
              <tbody>
                {reconDays.map(([date, day]) => (
                  <tr key={date} style={{ verticalAlign: 'top' }}>
                    <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{date.slice(8)}<span className="muted"> {monthName(date.slice(0, 7)).split(' ')[0].slice(0, 3)}</span></td>
                    <td>
                      {day.bank.length === 0 ? <span className="muted">—</span> : day.bank.map((t) => (
                        <div key={t.id} style={{ padding: '2px 0', fontSize: '0.83rem', overflowWrap: 'anywhere' }}>
                          {t.direction === 'debit' ? <span className="pill debit">−{inr(t.amount)}</span> : <span className="pill credit">+{inr(t.amount)}</span>}{' '}
                          <span className="muted">{accountsById[t.accountId]?.bank}{(t.manishSide || t.head === 'Manish Transfer' || t.head === 'Return to Investor') ? ' · ⭐Manish' : ''}{t.source === 'proof' ? ' · 🖼' : ''} · {(t.narration || '').slice(0, 46)}</span>
                        </div>
                      ))}
                    </td>
                    <td>
                      {day.chat.length === 0 ? <span className="muted">—</span> : day.chat.map((m, i) => {
                        const url = m.file && media[m.file];
                        return (
                          <div key={i} style={{ padding: '2px 0', fontSize: '0.83rem', overflowWrap: 'anywhere' }}>
                            <span className="muted" style={{ fontWeight: 600 }}>{m.sender === 'me' ? 'You' : 'Manish'}:</span>{' '}
                            {m.attach && !url && <span className="pill cash" title={m.file || ''}>{attachIcon(m.attach)}</span>}{' '}
                            {m.text}
                            {url && m.attach === 'photo' && (
                              <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 3 }}>
                                <img src={url} alt="screenshot" style={{ maxWidth: 160, maxHeight: 200, borderRadius: 6, border: '1px solid rgba(128,128,128,0.25)' }} />
                              </a>
                            )}
                            {url && m.attach === 'audio' && (
                              <audio controls preload="none" src={url} style={{ display: 'block', marginTop: 3, width: '100%', maxWidth: 240, height: 32 }} />
                            )}
                            {url && (m.attach === 'video') && (
                              <video controls preload="none" src={url} style={{ display: 'block', marginTop: 3, maxWidth: 200, borderRadius: 6 }} />
                            )}
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                      {e.kind === 'bank' && (txnSource[e.id] === 'proof'
                        ? <span className="pill cash" title="Added from a verified payment screenshot, not a bank statement">🖼 screenshot</span>
                        : txnSource[e.id] === 'manual'
                          ? <span className="pill untagged">manual</span>
                          : <span className="pill credit">bank</span>)}
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
