import { useState } from 'react';
import { useStore, addAccount, removeAccount, exportAll, importAll } from '../lib/store.js';

export default function Accounts() {
  const state = useStore();
  const [form, setForm] = useState({ label: '', bank: '', last4: '', email: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function add() {
    if (!form.label) return;
    addAccount(form);
    setForm({ label: '', bank: '', last4: '', email: '' });
  }

  function downloadBackup() {
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'munshi-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function restoreBackup(file) {
    try {
      importAll(await file.text());
    } catch (e) {
      alert('Could not restore: ' + e.message);
    }
  }

  return (
    <div>
      <h1>Accounts</h1>
      <p className="sub">
        Register each of your main accounts and the email ID it's linked to, so statements and
        alerts map to the right place.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add account</h2>
        <div className="row">
          <input placeholder="Label — e.g. HDFC Current (Business)" value={form.label} onChange={set('label')} style={{ minWidth: 220 }} />
          <input placeholder="Bank" value={form.bank} onChange={set('bank')} style={{ width: 120 }} />
          <input placeholder="Last 4 digits" value={form.last4} onChange={set('last4')} maxLength={4} style={{ width: 110 }} />
          <input placeholder="Linked email ID" type="email" value={form.email} onChange={set('email')} style={{ minWidth: 200 }} />
          <button onClick={add}>Add</button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Account</th><th>Bank</th><th>No.</th><th>Linked email</th><th className="num">Transactions</th><th></th></tr>
          </thead>
          <tbody>
            {state.accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td>{a.bank}</td>
                <td>{a.last4 && '••' + a.last4}</td>
                <td className="muted">{a.email}</td>
                <td className="num">{state.transactions.filter((t) => t.accountId === a.id).length}</td>
                <td>
                  {a.id !== 'cash' && (
                    <button
                      className="danger small"
                      onClick={() => {
                        if (confirm('Remove this account and all its transactions?')) removeAccount(a.id);
                      }}
                    >
                      remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Backup & restore</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          All data lives only in this browser (localStorage). Download a backup regularly; restore it
          on any device.
        </p>
        <div className="row">
          <button onClick={downloadBackup}>Download backup (.json)</button>
          <label className="secondary" style={{ display: 'inline-block' }}>
            <button className="secondary" style={{ pointerEvents: 'none' }}>Restore from backup…</button>
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && restoreBackup(e.target.files[0])} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>A note on security 🔒</h2>
        <p className="muted">
          This tool will never ask for — and you should never share with anyone — your internet
          banking password, card PINs, or OTPs. Sharing netbanking credentials violates your bank's
          terms and forfeits fraud protection under RBI rules. Statements and read-only alert emails
          give an accountant everything needed. When account linking arrives, it will be via the RBI
          Account Aggregator framework (consent-based, read-only, revocable).
        </p>
      </div>
    </div>
  );
}
