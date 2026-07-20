import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.js';
import { computeAdvice, avgMonthlyIncome, cardOutstanding } from '../lib/advice.js';
import { inr } from '../lib/parsers/common.js';

const ICON = { warn: '⚠️', info: '💡', good: '✅' };

export default function Save() {
  const state = useStore();
  const advice = useMemo(
    () => computeAdvice({ accounts: state.accounts, transactions: state.transactions, loans: state.loans }),
    [state.accounts, state.transactions, state.loans]
  );

  const income = avgMonthlyIncome(state.transactions);
  const emiTotal = state.loans.reduce((a, l) => a + (Number(l.emi) || 0), 0);
  const cardsOut = state.accounts
    .filter((a) => a.type === 'card')
    .reduce((a, c) => a + cardOutstanding(state.transactions, c), 0);

  return (
    <div>
      <h1>Save More</h1>
      <p className="sub">
        What a CA with your statements open would tell you this week — every tip computed from your
        own data, quantified in rupees. Add <Link to="/loans-cards">cards & loans</Link> and import
        statements to sharpen it.
      </p>

      <div className="grid cols-3">
        <div className="card stat">
          <div className="label">Avg monthly income (excl. tranches)</div>
          <div className="value">{income ? inr(income) : '—'}</div>
        </div>
        <div className="card stat">
          <div className="label">EMI burden</div>
          <div className="value">{inr(emiTotal)}<span style={{ fontSize: '0.9rem' }} className="muted">/mo</span></div>
          {income > 0 && emiTotal > 0 && <div className="hint">{Math.round((emiTotal / income) * 100)}% of income (FOIR)</div>}
        </div>
        <div className="card stat">
          <div className="label">Card outstanding</div>
          <div className={'value ' + (cardsOut > 0 ? 'neg' : '')}>{inr(cardsOut)}</div>
        </div>
      </div>

      {advice.map((a, i) => (
        <div className="card" key={i} style={{ borderLeft: '3px solid ' + (a.level === 'warn' ? 'var(--red)' : a.level === 'info' ? 'var(--accent)' : 'var(--green)') }}>
          <strong>{ICON[a.level]} {a.title}</strong>
          <p className="muted" style={{ marginTop: '0.35rem' }}>{a.detail}</p>
        </div>
      ))}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>The standing order</h2>
        <p className="muted">
          The boring rules that outperform every hack: pay cards in full, always. Never fund personal
          spends from investor money. Keep EMIs under 40% of income. Park surplus in sweep-in FDs, not
          savings. And keep every rupee to/from Manish on paper — the Manish ledger exists so nothing
          rests on memory.
        </p>
      </div>
    </div>
  );
}
