import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { NetWorth } from './pages/NetWorth';
import { Portfolio } from './pages/Portfolio';
import { Retirement } from './pages/Retirement';
import { MonteCarlo } from './pages/MonteCarlo';
import { Taxes } from './pages/Taxes';
import { SocialSecurity } from './pages/SocialSecurity';
import { Estate } from './pages/Estate';
import { Scenarios } from './pages/Scenarios';
import { Decisions } from './pages/Decisions';
import { CashFlow } from './pages/CashFlow';
import { AIAdvisor } from './pages/AIAdvisor';
import { Settings } from './pages/Settings';

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/net-worth" element={<NetWorth />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/retirement" element={<Retirement />} />
          <Route path="/monte-carlo" element={<MonteCarlo />} />
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/social-security" element={<SocialSecurity />} />
          <Route path="/estate" element={<Estate />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/decisions" element={<Decisions />} />
          <Route path="/cash-flow" element={<CashFlow />} />
          <Route path="/ai-advisor" element={<AIAdvisor />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
