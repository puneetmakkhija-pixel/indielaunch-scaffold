import { useState, useRef, useEffect } from 'react';
import {
  getState,
  bulkTagByText,
  reviewTransactions,
  detectSelfTransfers,
  exportAll,
} from '../lib/store.js';
import { HEAD_NAMES } from '../lib/categorize.js';
import { manishLedger } from '../lib/reconcile.js';
import { inr } from '../lib/parsers/common.js';

// A small, safe in-app assistant: it turns plain commands into live edits
// through the same action layer the UI uses. No API key, no backend, no
// external calls — everything runs client-side on your own data.
const HELP = [
  'Here\'s what I can do right now:',
  '• tag <text> as <head>  — e.g. "tag swiggy as food" (also remembers it as a rule)',
  '• mark <text> as manish — count it on the Manish side of the ledger',
  '• approve auto          — confirm all auto-tagged rows',
  '• match transfers       — pair A→B transfers between your own accounts',
  '• owe / manish          — your current settlement position with Manish',
  '• untagged              — how many rows still need a head, and the top repeats',
  '• spend on <head>       — total under a head',
  '• open <page>           — jump to manish / transactions / dashboard / monthly …',
  '• backup                — download a JSON backup',
].join('\n');

const PAGES = {
  dashboard: '/', monthly: '/monthly', import: '/import', transactions: '/transactions',
  analysis: '/analysis', save: '/save', 'loans': '/loans-cards', cards: '/loans-cards',
  tranches: '/tranches', manish: '/manish', rules: '/rules', accounts: '/accounts',
};

function matchHead(text) {
  const q = text.trim().toLowerCase();
  return (
    HEAD_NAMES.find((h) => h.toLowerCase() === q) ||
    HEAD_NAMES.find((h) => h.toLowerCase().startsWith(q)) ||
    HEAD_NAMES.find((h) => h.toLowerCase().includes(q)) ||
    null
  );
}

// Returns a reply string; performs the side effect.
function runCommand(raw) {
  const cmd = raw.trim();
  const low = cmd.toLowerCase();
  if (!cmd) return '';
  if (low === 'help' || low === '?') return HELP;

  let m;
  if ((m = cmd.match(/^tag\s+(.+?)\s+as\s+(.+?)(?:\s+(business|personal))?$/i))) {
    const head = matchHead(m[2]);
    if (!head) return `I don't know a head like "${m[2]}". Known heads include: ${HEAD_NAMES.slice(0, 8).join(', ')}…`;
    const scope = m[3] ? m[3].toLowerCase() : undefined;
    const n = bulkTagByText(m[1], { head, scope }, { addRuleToo: true });
    return n ? `Tagged ${n} transaction${n > 1 ? 's' : ''} matching "${m[1]}" as ${head}${scope ? ' (' + scope + ')' : ''}, and saved a rule so future ones tag automatically.` : `No transactions contain "${m[1]}".`;
  }
  if ((m = cmd.match(/^mark\s+(.+?)\s+as\s+manish/i))) {
    const n = bulkTagByText(m[1], { head: 'Manish Transfer', scope: 'business', manishSide: true });
    return n ? `Marked ${n} row${n > 1 ? 's' : ''} matching "${m[1]}" as Manish-side.` : `No transactions contain "${m[1]}".`;
  }
  if (/^approve( all)?( auto)?/i.test(low)) {
    const ids = getState().transactions.filter((t) => t.autoTagged && !t.reviewed).map((t) => t.id);
    const n = reviewTransactions(ids);
    return n ? `Approved ${n} auto-tagged transaction${n > 1 ? 's' : ''}.` : 'Nothing auto-tagged is waiting for approval.';
  }
  if (/^match( a.?b)?( transfers?)?$/i.test(low) || low === 'match transfers') {
    const n = detectSelfTransfers();
    return n ? `Matched ${n} internal transfer pair${n > 1 ? 's' : ''} — counted once now.` : 'No new A→B transfer pairs found.';
  }
  if (/\bowe\b|^manish$|net position|settlement/i.test(low)) {
    const s = getState();
    const l = manishLedger(s.manishClaims, s.transactions, s.manishAnchor);
    if (l.youOwe != null) {
      return `${l.youOwe > 0 ? 'You owe Manish' : 'Manish owes you'} ${inr(Math.abs(l.youOwe))} (from the ${l.anchor.date} balance of ${inr(l.anchor.youOwe)}, − ${inr(l.postSent)} you paid since, + ${inr(l.postReceived)} received since).`;
    }
    return `${l.net >= 0 ? 'Manish owes you' : 'You owe Manish'} ${inr(Math.abs(l.net))} on record (no opening balance set).`;
  }
  if (/^untagged/i.test(low)) {
    const un = getState().transactions.filter((t) => !t.head);
    const g = {};
    for (const t of un) { const k = (t.narration || '').replace(/[0-9]{4,}/g, '').slice(0, 20).trim().toUpperCase() || '(blank)'; g[k] = (g[k] || 0) + 1; }
    const top = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${v}× ${k}`);
    return `${un.length} transactions still need a head.\nTop repeats: ${top.join(' · ')}`;
  }
  if ((m = cmd.match(/^spend on\s+(.+)/i))) {
    const head = matchHead(m[1]);
    if (!head) return `Unknown head "${m[1]}".`;
    const total = getState().transactions.filter((t) => t.head === head && t.direction === 'debit').reduce((a, t) => a + t.amount, 0);
    return `Total under ${head}: ${inr(total)}.`;
  }
  if ((m = cmd.match(/^(open|go to|show)\s+(.+)/i))) {
    const key = Object.keys(PAGES).find((k) => m[2].toLowerCase().includes(k));
    if (key) { window.location.hash = '#' + PAGES[key]; return `Opened ${key}.`; }
    return `I can open: ${Object.keys(PAGES).join(', ')}.`;
  }
  if (/^backup|download/i.test(low)) {
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'munshi-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    return 'Backup downloaded.';
  }
  return `I didn't catch that. Type "help" to see what I can do.`;
}

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [log, setLog] = useState([{ who: 'bot', text: 'Hi — I\'m your in-app assistant. Type a command like "tag swiggy as food" or "owe". Say "help" for the list.' }]);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [log, open]);

  function send() {
    const text = input.trim();
    if (!text) return;
    let reply;
    try { reply = runCommand(text); } catch (e) { reply = 'Something went wrong: ' + (e.message || e); }
    setLog((l) => [...l, { who: 'you', text }, { who: 'bot', text: reply }]);
    setInput('');
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Open the in-app assistant"
        style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 50, borderRadius: 24, padding: '0.6rem 1rem', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}
      >
        💬 Assistant
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 50, width: 'min(380px, calc(100vw - 40px))', height: 'min(520px, calc(100vh - 40px))', display: 'flex', flexDirection: 'column', background: 'var(--card, #1b1f24)', border: '1px solid var(--border, rgba(128,128,128,0.3))', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
      <div className="spread" style={{ padding: '0.6rem 0.8rem', borderBottom: '1px solid var(--border, rgba(128,128,128,0.3))' }}>
        <strong>Assistant</strong>
        <button className="small secondary" onClick={() => setOpen(false)}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.6rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {log.map((m, i) => (
          <div key={i} style={{ alignSelf: m.who === 'you' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.who === 'you' ? 'var(--accent, #2f81f7)' : 'rgba(128,128,128,0.15)', color: m.who === 'you' ? '#fff' : 'inherit', padding: '0.4rem 0.6rem', borderRadius: 10, fontSize: '0.85rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="row" style={{ padding: '0.6rem 0.8rem', borderTop: '1px solid var(--border, rgba(128,128,128,0.3))', gap: '0.4rem' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder='e.g. tag amazon as shopping'
          style={{ flex: 1 }}
          autoFocus
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}
