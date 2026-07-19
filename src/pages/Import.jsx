import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, importTransactions } from '../lib/store.js';
import { parseCsvStatement } from '../lib/parsers/csv.js';
import { inr2 } from '../lib/parsers/common.js';

export default function ImportPage() {
  const state = useStore();
  const bankAccounts = state.accounts.filter((a) => a.type === 'bank');
  const [accountId, setAccountId] = useState('');
  const [preview, setPreview] = useState(null); // {source, txns}
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const pdfFileRef = useRef(null);
  const activeAccount = accountId || bankAccounts[0]?.id || '';

  async function handlePdf(file) {
    setError('');
    setResult(null);
    setBusy(true);
    try {
      pdfFileRef.current = file;
      const buf = await file.arrayBuffer();
      const { parsePdfStatement } = await import('../lib/parsers/pdf.js');
      const txns = await parsePdfStatement(buf, pdfPassword);
      setPreview({ source: 'pdf', txns });
      setNeedsPassword(false);
    } catch (e) {
      if (e.message === 'PASSWORD_REQUIRED') {
        setNeedsPassword(true);
        setError('This PDF is password-protected (banks usually use your DOB or PAN — check the statement email). Enter it below and re-select the file.');
      } else {
        setError(e.message || String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCsv(file) {
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const text = await file.text();
      const txns = parseCsvStatement(text);
      if (!txns.length) throw new Error('Found the header row but no transaction rows parsed.');
      setPreview({ source: 'csv', txns });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmImport() {
    if (!preview || !activeAccount) return;
    const res = importTransactions(activeAccount, preview.txns, preview.source);
    setResult(res);
    setPreview(null);
  }

  if (!bankAccounts.length) {
    return (
      <div>
        <h1>Import</h1>
        <p className="sub">Bring in transactions from your bank statements.</p>
        <div className="notice">
          First add a bank account on the <Link to="/accounts">Accounts</Link> page, so imports land in the right place.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Import</h1>
      <p className="sub">
        Upload statements from each of your main accounts. Everything is parsed locally in your
        browser — statements are never uploaded to a server.
      </p>

      <div className="card">
        <label className="field" style={{ maxWidth: 420 }}>
          <span>Import into account</span>
          <select value={activeAccount} onChange={(e) => setAccountId(e.target.value)} style={{ width: '100%' }}>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} {a.last4 && `(••${a.last4})`} {a.email && `— ${a.email}`}
              </option>
            ))}
          </select>
        </label>

        <div className="grid cols-2">
          <div>
            <h2 style={{ marginTop: 0 }}>PDF bank statement</h2>
            <label className="dropzone" style={{ display: 'block' }}>
              {busy ? 'Parsing…' : 'Click to choose a statement PDF'}
              <input
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files[0] && handlePdf(e.target.files[0])}
              />
            </label>
            {needsPassword && (
              <label className="field" style={{ marginTop: '0.75rem' }}>
                <span>PDF password</span>
                <input
                  type="password"
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  placeholder="e.g. DDMMYYYY or PAN"
                />
              </label>
            )}
          </div>
          <div>
            <h2 style={{ marginTop: 0 }}>CSV / delimited export</h2>
            <label className="dropzone" style={{ display: 'block' }}>
              {busy ? 'Parsing…' : 'Click to choose a CSV export'}
              <input
                type="file"
                accept=".csv,text/csv,.txt"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files[0] && handleCsv(e.target.files[0])}
              />
            </label>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Most reliable format — every netbanking portal has a "Download as CSV/Excel" option
              on the statement page.
            </p>
          </div>
        </div>

        {error && <div className="notice" style={{ marginTop: '1rem' }}>{error}</div>}
        {result && (
          <div className="notice good" style={{ marginTop: '1rem' }}>
            Imported {result.added} transaction{result.added !== 1 ? 's' : ''}
            {result.skipped > 0 && `, skipped ${result.skipped} duplicate${result.skipped !== 1 ? 's' : ''}`}.{' '}
            <Link to="/transactions">Review & tag them →</Link>
          </div>
        )}
      </div>

      {preview && (
        <div className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>Preview — {preview.txns.length} transactions found</h2>
            <div className="row">
              <button className="secondary" onClick={() => setPreview(null)}>Discard</button>
              <button onClick={confirmImport}>Import {preview.txns.length} transactions</button>
            </div>
          </div>
          <p className="muted" style={{ margin: '0.5rem 0' }}>
            Duplicates already in your book will be skipped automatically. Rules will auto-tag known merchants.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Date</th><th>Narration</th><th></th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {preview.txns.slice(0, 100).map((t, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td>{t.narration} {t.uncertain && <span className="pill untagged">check direction</span>}</td>
                    <td><span className={'pill ' + t.direction}>{t.direction === 'debit' ? 'out' : 'in'}</span></td>
                    <td className="num">{inr2(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.txns.length > 100 && <p className="muted">…and {preview.txns.length - 100} more.</p>}
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Daily email & auto-sync (roadmap)</h2>
        <p className="muted">
          Never link your internet-banking password anywhere — no legitimate tool needs it, and it
          voids your bank's fraud protection. The safe ways to automate daily ingestion, in order:
        </p>
        <ol style={{ marginLeft: '1.25rem', marginTop: '0.5rem', color: 'var(--muted)' }}>
          <li>Bank transaction-alert emails parsed from your inbox via read-only Gmail access.</li>
          <li>RBI Account Aggregator (Setu / Finvu / OneMoney) — consent-based, read-only bank feeds.</li>
          <li>Until then: this page, daily or weekly. It takes about a minute per account.</li>
        </ol>
      </div>
    </div>
  );
}
