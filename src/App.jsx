import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useState } from 'react';

function Home() {
  const [email, setEmail] = useState('');
  const handleSubmit = (e) => { e.preventDefault(); alert(`Thanks! We'll reach out to ${email}`); setEmail(''); };
  return (
    <div>
      <section style={{minHeight:'80vh',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',textAlign:'center',padding:'2rem'}}>
        <h1 style={{fontSize:'3.5rem',marginBottom:'1rem',lineHeight:1.1}}>Get Your First 100 Paying Users</h1>
        <p style={{fontSize:'1.25rem',maxWidth:'600px',marginBottom:'2rem',opacity:0.9}}>Beautiful landing pages and smart pricing tools built for indie SaaS founders shipping their first product.</p>
        <form onSubmit={handleSubmit} style={{display:'flex',gap:'0.5rem',maxWidth:'500px',width:'100%'}}>
          <input type="email" placeholder="your@email.com" value={email} onChange={(e)=>setEmail(e.target.value)} required style={{flex:1,padding:'0.75rem 1rem',background:'#1a1a1a',border:'1px solid #333',borderRadius:'6px',color:'#fff',fontSize:'1rem'}}/>
          <button type="submit" style={{padding:'0.75rem 2rem',background:'#FF4500',border:'none',borderRadius:'6px',color:'#fff',fontWeight:'bold',cursor:'pointer',fontSize:'1rem'}}>Join Waitlist</button>
        </form>
      </section>
      <section style={{padding:'4rem 2rem',background:'#0a0a0a'}}>
        <h2 style={{fontSize:'2rem',textAlign:'center',marginBottom:'3rem'}}>What You Get</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:'2rem',maxWidth:'1200px',margin:'0 auto'}}>
          <div style={{padding:'1.5rem',background:'#1a1a1a',borderRadius:'8px',border:'1px solid #333'}}>
            <h3 style={{color:'#FF4500',marginBottom:'0.5rem'}}>Landing Page Builder</h3>
            <p style={{opacity:0.8}}>Convert visitors with proven layouts designed for SaaS products.</p>
          </div>
          <div style={{padding:'1.5rem',background:'#1a1a1a',borderRadius:'8px',border:'1px solid #333'}}>
            <h3 style={{color:'#FF4500',marginBottom:'0.5rem'}}>Pricing Generator</h3>
            <p style={{opacity:0.8}}>Find the sweet spot with AI-powered pricing recommendations.</p>
          </div>
          <div style={{padding:'1.5rem',background:'#1a1a1a',borderRadius:'8px',border:'1px solid #333'}}>
            <h3 style={{color:'#FF4500',marginBottom:'0.5rem'}}>Stripe Integration</h3>
            <p style={{opacity:0.8}}>Start collecting payments in minutes, not days.</p>
          </div>
        </div>
      </section>
      <section style={{padding:'4rem 2rem'}}>
        <h2 style={{fontSize:'2rem',textAlign:'center',marginBottom:'3rem'}}>Founders Love It</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'2rem',maxWidth:'1200px',margin:'0 auto'}}>
          <div style={{padding:'1.5rem',background:'#1a1a1a',borderRadius:'8px',border:'1px solid #333'}}>
            <p style={{marginBottom:'1rem',fontStyle:'italic'}}>"IndieLaunch helped me validate pricing before I even launched. Got 12 paying users in the first week."</p>
            <p style={{color:'#FF4500',fontWeight:'bold'}}>— Sarah Chen, DevMetrics</p>
          </div>
          <div style={{padding:'1.5rem',background:'#1a1a1a',borderRadius:'8px',border:'1px solid #333'}}>
            <p style={{marginBottom:'1rem',fontStyle:'italic'}}>"Finally, a tool that understands solo founders. No bloat, just what you need to ship."</p>
            <p style={{color:'#FF4500',fontWeight:'bold'}}>— Marcus Liu, APIWizard</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Pricing() {
  const [mrr, setMrr] = useState(1000);
  const suggested = Math.round(mrr * 0.08);
  return (
    <div style={{minHeight:'80vh',padding:'4rem 2rem'}}>
      <h1 style={{fontSize:'3rem',textAlign:'center',marginBottom:'1rem'}}>Smart Pricing Calculator</h1>
      <p style={{textAlign:'center',fontSize:'1.1rem',opacity:0.9,marginBottom:'3rem',maxWidth:'600px',margin:'0 auto 3rem'}}>Find the right price point for your SaaS based on your target MRR.</p>
      <div style={{maxWidth:'600px',margin:'0 auto',background:'#1a1a1a',padding:'2rem',borderRadius:'12px',border:'1px solid #333'}}>
        <label style={{display:'block',marginBottom:'1rem',fontSize:'1.1rem'}}>Target Monthly Recurring Revenue</label>
        <input type="range" min="500" max="10000" step="100" value={mrr} onChange={(e)=>setMrr(Number(e.target.value))} style={{width:'100%',marginBottom:'1rem'}}/>
        <div style={{fontSize:'2rem',color:'#FF4500',marginBottom:'2rem'}}>${mrr}/mo</div>
        <div style={{padding:'1.5rem',background:'#0a0a0a',borderRadius:'8px',marginBottom:'2rem'}}>
          <h3 style={{marginBottom:'0.5rem'}}>Recommended Price</h3>
          <div style={{fontSize:'2.5rem',color:'#FF4500',fontWeight:'bold'}}>${suggested}<span style={{fontSize:'1rem',opacity:0.7}}>/month</span></div>
          <p style={{opacity:0.8,marginTop:'0.5rem'}}>Based on ~12-15 customers to reach your MRR goal</p>
        </div>
        <button style={{width:'100%',padding:'1rem',background:'#FF4500',border:'none',borderRadius:'6px',color:'#fff',fontSize:'1.1rem',fontWeight:'bold',cursor:'pointer'}}>Start Free Trial</button>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div style={{minHeight:'100vh',background:'#0d0d0d',color:'#fff'}}>
        <nav style={{padding:'1rem 2rem',borderBottom:'1px solid #333',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <Link to="/" style={{fontSize:'1.5rem',fontWeight:'bold',color:'#FF4500',textDecoration:'none'}}>IndieLaunch</Link>
          <div style={{display:'flex',gap:'2rem'}}>
            <Link to="/" style={{color:'#fff',textDecoration:'none',opacity:0.9}}>Home</Link>
            <Link to="/pricing" style={{color:'#fff',textDecoration:'none',opacity:0.9}}>Pricing</Link>
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pricing" element={<Pricing />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;