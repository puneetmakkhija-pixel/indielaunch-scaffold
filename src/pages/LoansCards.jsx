import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, addAccount, updateAccount, removeAccount, addLoan, updateLoan, removeLoan } from '../lib/store.js';
import { cardOutstanding } from '../lib/advice.js';
import { detectEmis } from '../lib/analysis.js';
import { inr } from '../lib/parsers/common.js';

function CardForm() {
  const [form, setForm] = useState({ label: '', bank: '', last4: '', limit: '', dueDay: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  function add() {
    if (!form.label) return;
    addAccount({ ...form, type: 'card', email: '' });
    setForm({ label: '', bank: '', last4: '', limit: '', dueDay: '' });
  }
  return (
    <div className="row">
      <input placeholder="Card name — e.g. HDFC Regalia" value={form.label} onChange={set('label')} style={{ minWidth: 200 }} />
      <input placeholder="Bank" value={form.bank} onChange={set('bank')} style={{ width: 110 }} />
      <input placeholder="Last 4" value={form.last4} onChange={set('last4')} maxLength={4} style={{ width: 90 }} />
      <input placeholder="Credit limit" type="number" value={form.limit} onChange={set('limit')} style={{ width: 130 }} />
      <input placeholder="Due day (1-31)" type="number" min="1" max="31" value={form.dueDay} onChange={set('dueDay')} style={{ width: 130 }} />
      <button onClick={add}>Add card</button>
    </div>
  );
}

function LoanForm({ prefill, onDone }) {
  const [form, setForm] = useState(
    prefill || { lender: '', outstanding: '', emi: '', rate: '', emiDay: '', endDate: '', notes: '' }
  );
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  function add() {
    if (!form.lender || !form.emi) return;
    addLoan({
      ...form,
      outstanding: Number(form.outstanding) || 0,
      emi: Number(form.emi) || 0,
      rate: Number(form.rate) || 0,
    });
    setForm({ lender: '', outstanding: '', emi: '', rate: '', emiDay: '', endDate: '', notes: '' });
    onDone?.();
  }
  return (
    <div className="row">
      <input placeholder="Lender — e.g. Bajaj Finance" value={form.lender} onChange={set('lender')} style={{ minWidth: 180 }} />
      <input placeholder="Outstanding ₹" type="number" value={form.outstanding} onChange={set('outstanding')} style={{ width: 140 }} />
      <input placeholder="EMI ₹/month" type="number" value={form.emi} onChange={set('emi')} style={{ width: 130 }} />
      <input placeholder="Rate %" type="number" step="0.1" value={form.rate} onChange={set('rate')} style={{ width: 100 }} />
      <input placeholder="EMI day" type="number" min="1" max="31" value={form.emiDay} onChange={set('emiDay')} style={{ width: 100 }} />
      <input type="date" value={form.endDate} onChange={set('endDate')} title="Ends" />
      <button onClick={add}>Add loan</button>
    </div>
  );
}

export default function LoansCards() {
  const state = useStore();
  const cards = state.accounts.filter((a) => a.type === 'card');
  const [prefill, setPrefill] = useState(null);

  const detectedEmis = useMemo(() => detectEmis(state.transactions), [state.transactions]);
  const unregistered = detectedEmis.filter(
    (e) => !state.loans.some((l) => l.lender.toUpperCase().includes(e.lender.slice(0, 6)) || e.lender.includes(l.lender.toUpperCase().slice(0, 6)))
  );

  const emiTotal = state.loans.reduce((a, l) => a + (Number(l.emi) || 0), 0);
  const loanOutstanding = state.loans.reduce((a, l) => a + (Number(l.outstanding) || 0), 0);
  const yearlyInterest = state.loans.reduce((a, l) => a + ((Number(l.outstanding) || 0) * (Number(l.rate) || 0)) / 100, 0);

  return (
    <div>
      <h1>Loans & Cards</h1>
      <p className="sub">
        Register credit cards and loans so the accountant can watch utilisation, due dates, EMI
        burden and interest leakage — see <Link to="/save">Save More</Link> for the guidance built on these.
      </p>

      <div className="grid cols-3">
        <div className="card stat">
          <div className="label">Total EMI / month</div>
          <div className="value">{inr(emiTotal)}</div>
        </div>
        <div className="card stat">
          <div className="label">Loan outstanding</div>
          <div className="value">{inr(loanOutstanding)}</div>
        </div>
        <div className="card stat">
          <div className="label">Interest cost / year (approx)</div>
          <div className="value neg">{inr(yearlyInterest)}</div>
        </div>
      </div>

      <h2>Credit cards</h2>
      <div className="card">
        <CardForm />
        {cards.length > 0 && (
          <table style={{ marginTop: '1rem' }}>
            <thead>
              <tr><th>Card</th><th>No.</th><th className="num">Outstanding</th><th className="num">Limit</th><th className="num">Utilisation</th><th>Due day</th><th></th></tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const out = cardOutstanding(state.transactions, c);
                const limit = Number(c.limit) || 0;
                const util = limit ? out / limit : null;
                return (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td>{c.last4 && '••' + c.last4}</td>
                    <td className="num">
                      <input
                        type="number"
                        placeholder={String(Math.round(out))}
                        defaultValue={c.outstanding ?? ''}
                        onBlur={(e) => updateAccount(c.id, { outstanding: e.target.value })}
                        style={{ width: 110, textAlign: 'right' }}
                        title="Computed from imported card transactions; type a value to override with the statement figure"
                      />
                    </td>
                    <td className="num">{limit ? inr(limit) : '—'}</td>
                    <td className={'num ' + (util > 0.3 ? 'neg' : 'pos')}>{util != null ? Math.round(util * 100) + '%' : '—'}</td>
                    <td>{c.dueDay || '—'}</td>
                    <td>
                      <button className="danger small" onClick={() => { if (confirm('Remove this card and its transactions?')) removeAccount(c.id); }}>remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ marginTop: '0.6rem', fontSize: '0.83rem' }}>
          Import card statements on the <Link to="/import">Import</Link> page (select the card as the
          account) to compute outstanding automatically, or type the statement figure into the
          Outstanding box.
        </p>
      </div>

      <h2>Loans</h2>
      <div className="card">
        <LoanForm prefill={prefill} onDone={() => setPrefill(null)} />
        {state.loans.length > 0 && (
          <table style={{ marginTop: '1rem' }}>
            <thead>
              <tr><th>Lender</th><th className="num">Outstanding</th><th className="num">EMI</th><th className="num">Rate</th><th className="num">Interest/yr</th><th>EMI day</th><th>Ends</th><th></th></tr>
            </thead>
            <tbody>
              {state.loans.map((l) => (
                <tr key={l.id}>
                  <td>{l.lender}</td>
                  <td className="num">{inr(l.outstanding)}</td>
                  <td className="num">{inr(l.emi)}</td>
                  <td className="num">{l.rate ? l.rate + '%' : '—'}</td>
                  <td className="num neg">{l.rate ? inr((l.outstanding * l.rate) / 100) : '—'}</td>
                  <td>{l.emiDay || '—'}</td>
                  <td>{l.endDate || '—'}</td>
                  <td><button className="danger small" onClick={() => removeLoan(l.id)}>remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {unregistered.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Detected in your statements — add these?</h2>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            Recurring NACH/ECS/EMI debits that aren't in your loan register yet.
          </p>
          <table>
            <tbody>
              {unregistered.map((e) => (
                <tr key={e.lender}>
                  <td>{e.lender}</td>
                  <td className="num">{inr(e.avgAmount)}/month</td>
                  <td className="muted">{e.count} debits over {e.months} month{e.months > 1 ? 's' : ''}</td>
                  <td>
                    <button
                      className="small secondary"
                      onClick={() => { setPrefill({ lender: e.lender, outstanding: '', emi: String(Math.round(e.avgAmount)), rate: '', emiDay: '', endDate: '', notes: '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    >
                      Prefill loan form
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
