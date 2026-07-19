import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.js';
import { inr } from '../lib/parsers/common.js';
import { monthlyTurnover, averageBalance, detectBounces, detectEmis, detectRecurring } from '../lib/analysis.js';

export default function Analysis() {
  const state = useStore();
  const bankAccounts = state.accounts.filter((a) => a.type === 'bank');

  const turnover = useMemo(() => monthlyTurnover(state.transactions), [state.transactions]);
  const bounces = useMemo(() => detectBounces(state.transactions), [state.transactions]);
  const emis = useMemo(() => detectEmis(state.transactions), [state.transactions]);
  const recurring = useMemo(() => detectRecurring(state.transactions), [state.transactions]);
  const balances = useMemo(
    () =>
      bankAccounts.map((a) => ({
        account: a,
        d30: averageBalance(state.transactions, a.id, 30),
        d90: averageBalance(state.transactions, a.id, 90),
      })),
    [state.transactions, bankAccounts]
  );
  const hasBalances = balances.some((b) => b.d30 || b.d90);

  if (!state.transactions.length) {
    return (
      <div>
        <h1>CA Analysis</h1>
        <p className="sub">Turnover, average balance, bounces, EMIs and recurring spends — the numbers a CA or lender looks at first.</p>
        <div className="card"><p className="muted"><Link to="/import">Import a statement</Link> to see the analysis.</p></div>
      </div>
    );
  }

  return (
    <div>
      <h1>CA Analysis</h1>
      <p className="sub">
        The underwriting view of your statements: banking turnover, average balance, bounce history,
        EMIs, and repetitive spends.
      </p>

      <h2>Average balance</h2>
      {hasBalances ? (
        <div className="card">
          <table>
            <thead>
              <tr><th>Account</th><th className="num">Avg — last 30 days</th><th className="num">Avg — last 90 days</th></tr>
            </thead>
            <tbody>
              {balances.map(({ account, d30, d90 }) => (
                <tr key={account.id}>
                  <td>{account.label}</td>
                  <td className="num">{d30 ? inr(d30.average) : <span className="muted">—</span>}</td>
                  <td className="num">{d90 ? inr(d90.average) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.83rem' }}>
            Computed from the running-balance column of imported statements, carrying end-of-day
            balances forward through quiet days.
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            No running-balance data yet — balances are captured from statements imported from now on
            (PDF and CSV both carry them). Re-import a recent statement to populate this.
          </p>
        </div>
      )}

      <h2>Monthly banking turnover</h2>
      <div className="card">
        <table>
          <thead>
            <tr><th>Month</th><th className="num">Credits in</th><th className="num">Debits out</th><th className="num">Net</th></tr>
          </thead>
          <tbody>
            {turnover.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td className="num pos">{inr(r.credits)}</td>
                <td className="num">{inr(r.debits)}</td>
                <td className={'num ' + (r.net >= 0 ? 'pos' : 'neg')}>{inr(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.83rem' }}>Self transfers between your own accounts are excluded.</p>
      </div>

      <h2>Bounces & return charges</h2>
      <div className={'card'}>
        {bounces.count === 0 ? (
          <p className="pos" style={{ margin: 0 }}>✓ No cheque/NACH/ECS returns detected — clean record, keep it that way.</p>
        ) : (
          <>
            <p className="neg" style={{ marginBottom: '0.75rem' }}>
              {bounces.count} bounce-related entr{bounces.count > 1 ? 'ies' : 'y'} totalling {inr(bounces.totalAmount)} —
              lenders read these as red flags; worth clearing the cause quickly.
            </p>
            <table>
              <tbody>
                {bounces.transactions.map((t) => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td className="muted">{t.narration}</td>
                    <td className="num">{inr(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <h2>EMIs & loan repayments</h2>
      <div className="card">
        {emis.length === 0 ? (
          <p className="muted">No NACH/ECS/EMI debits detected.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Lender / mandate</th><th className="num">Instalments</th><th className="num">Months</th><th className="num">Avg EMI</th><th className="num">Total paid</th></tr>
            </thead>
            <tbody>
              {emis.map((e) => (
                <tr key={e.lender}>
                  <td>{e.lender}</td>
                  <td className="num">{e.count}</td>
                  <td className="num">{e.months}</td>
                  <td className="num">{inr(e.avgAmount)}</td>
                  <td className="num">{inr(e.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Repetitive spends</h2>
      <div className="card">
        {recurring.length === 0 ? (
          <p className="muted">Import 2+ months of statements to detect repeating merchants and subscriptions.</p>
        ) : (
          <>
            <table>
              <thead>
                <tr><th>Merchant</th><th>Tagged as</th><th className="num">Times</th><th className="num">Months</th><th className="num">Avg</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {recurring.slice(0, 25).map((r) => (
                  <tr key={r.token}>
                    <td>{r.token}</td>
                    <td>{r.head || <span className="pill untagged">untagged</span>}</td>
                    <td className="num">{r.count}</td>
                    <td className="num">{r.months}</td>
                    <td className="num">{inr(r.avgAmount)}</td>
                    <td className="num">{inr(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.83rem' }}>
              Untagged repeaters are the best candidates for <Link to="/rules">rules</Link> — tag one occurrence with
              "remember" and the rest follow.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
