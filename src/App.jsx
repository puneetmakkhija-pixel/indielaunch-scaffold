import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useStore } from './lib/store.js';
import Dashboard from './pages/Dashboard.jsx';
import ImportPage from './pages/Import.jsx';
import Transactions from './pages/Transactions.jsx';
import Rules from './pages/Rules.jsx';
import Tranches from './pages/Tranches.jsx';
import Manish from './pages/Manish.jsx';
import Accounts from './pages/Accounts.jsx';
import Analysis from './pages/Analysis.jsx';
import LoansCards from './pages/LoansCards.jsx';
import Save from './pages/Save.jsx';
import Monthly from './pages/Monthly.jsx';
import Assistant from './components/Assistant.jsx';

export default function App() {
  const state = useStore();
  const unreviewed = state.transactions.filter((t) => !t.reviewed).length;

  return (
    <HashRouter>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            Munshi<span>.</span>
          </div>
          <nav>
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/monthly">Monthly Recon</NavLink>
            <NavLink to="/import">Import</NavLink>
            <NavLink to="/transactions">
              Transactions
              {unreviewed > 0 && <span className="badge-count">{unreviewed}</span>}
            </NavLink>
            <NavLink to="/analysis">CA Analysis</NavLink>
            <NavLink to="/save">Save More</NavLink>
            <NavLink to="/loans-cards">Loans & Cards</NavLink>
            <NavLink to="/tranches">Investor Tranches</NavLink>
            <NavLink to="/manish">Manish Ledger</NavLink>
            <NavLink to="/rules">Rules</NavLink>
            <NavLink to="/accounts">Accounts</NavLink>
          </nav>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/monthly" element={<Monthly />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/save" element={<Save />} />
            <Route path="/loans-cards" element={<LoansCards />} />
            <Route path="/tranches" element={<Tranches />} />
            <Route path="/manish" element={<Manish />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/accounts" element={<Accounts />} />
          </Routes>
        </main>
        <Assistant />
      </div>
    </HashRouter>
  );
}
