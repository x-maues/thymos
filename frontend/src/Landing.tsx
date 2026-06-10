import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type MandateDraft = {
  label: string;
  amount: string;
  triggerPrice: string;
  maxSlippageBps: string;
  bounty: string;
  expiryMinutes: string;
  outputAsset: string;
  notes: string;
};

const draftStorageKey = "thymos.mandateDraft";
const sampleMandates: Array<{ id: string; title: string; description: string; draft: MandateDraft }> = [
  {
    id: "guarded-usdc",
    title: "Guarded USDC Sweep",
    description: "Small treasury rescue with a fast trigger and conservative execution limits.",
    draft: {
      label: "Guarded USDC Sweep",
      amount: "100",
      triggerPrice: "0.985",
      maxSlippageBps: "50",
      bounty: "0.05",
      expiryMinutes: "60",
      outputAsset: "mDAI",
      notes: "Best for testing the default hackathon path."
    }
  },
  {
    id: "rapid-response",
    title: "Rapid Response Reserve",
    description: "Higher-value mandate with tighter trigger and more aggressive bounty.",
    draft: {
      label: "Rapid Response Reserve",
      amount: "250",
      triggerPrice: "0.990",
      maxSlippageBps: "75",
      bounty: "0.10",
      expiryMinutes: "45",
      outputAsset: "mDAI",
      notes: "Use this to test a quick activation flow."
    }
  },
  {
    id: "treasury-shield",
    title: "Treasury Shield",
    description: "Larger balance with extra room on expiry for a slower agent cycle.",
    draft: {
      label: "Treasury Shield",
      amount: "1000",
      triggerPrice: "0.975",
      maxSlippageBps: "100",
      bounty: "0.25",
      expiryMinutes: "180",
      outputAsset: "mDAI",
      notes: "Good for demonstrating the platform to a DAO audience."
    }
  }
];

export default function Landing() {
  // Background videos replace canvas animation
  const navigate = useNavigate();
  const [draft, setDraft] = useState<MandateDraft>(sampleMandates[0].draft);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("om-visible");
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".om-fade").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const draftSummary = useMemo(
    () => [
      `${draft.amount} USDC`,
      `Trigger $${draft.triggerPrice}`,
      `${Number(draft.maxSlippageBps) / 100}% slippage`,
      `${draft.bounty} STT bounty`,
      `${draft.expiryMinutes} min expiry`
    ],
    [draft]
  );

  function setSample(sampleId: string) {
    const sample = sampleMandates.find((item) => item.id === sampleId);
    if (sample) setDraft(sample.draft);
  }

  function launchDraft() {
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    navigate("/dashboard");
  }

  const tickerItems = [
    ["Network", "Somnia Testnet"],
    ["Cross-Chain Routing", "LI.FI"],
    ["Settlement", "Deterministic"],
    ["Execution Latency", "Sub-Second"],
    ["Oracle Model", "Trustless"],
    ["Agent Policy", "On-Chain"],
    ["Protocol", "Permissionless"],
  ];

  const stats = [
    { label: "Architecture", value: "L1", desc: "Native Somnia chain primitives, no bridging overhead" },
    { label: "Consensus Model", value: "BFT", desc: "Byzantine fault-tolerant agent verification" },
    { label: "Price Feeds", value: "0", desc: "Trusted oracles required. JSON proofs only" },
    { label: "Operator Count", value: "0", desc: "Human operators in the execution path" },
  ];

  const features = [
    {
      index: "01 — CONSENSUS",
      title: "Somnia Agents",
      desc: "Intelligence validated by consensus. Native JSON API attestations prove off-chain states directly to the contract — CoinGecko prices, execution proofs — without trusted intermediaries.",
    },
    {
      index: "02 — REACTIVITY",
      title: "Native Triggers",
      desc: "Zero human operators. Somnia's L1 reactivity wakes the agent network the exact second a financial mandate is funded on-chain. No polling. No cron jobs.",
    },
    {
      index: "03 — ENFORCEMENT",
      title: "Policy Engine",
      desc: "Agents propose. Solidity disposes. Hardcoded constraints mathematically verify LI.FI routes and slippage bounds before any execution occurs. Code is law.",
    },
  ];

  const journey = [
    {
      title: "User Journey",
      summary: "What a DAO experiences when securing their treasury.",
      steps: [
        "Connect a Gnosis Safe or multisig.",
        "Deposit USDC and post the mandate rule.",
        "Somnia reactivity opens evaluation automatically.",
        "Independent agents confirm the trigger and discover routes.",
        "The best compliant route executes.",
        "The treasury wakes up in the defensive asset.",
      ],
    },
    {
      title: "Agent Journey",
      summary: "How the decentralized agent network fulfills mandates.",
      steps: [
        "Listen for MandateCreated events on the Somnia Network.",
        "Monitor live market conditions via Somnia JSON APIs.",
        "Publish cryptographically signed evidence on-chain.",
        "Simulate optimal routing and compute slippage across DEXes.",
        "Submit execution proposals to the smart contract.",
        "Winning agent executes the payload and claims the bounty.",
      ],
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

        .om-root {
          background: #000;
          color: #fff;
          font-family: 'Space Grotesk', sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
          position: relative;
        }
        .om-bg-wrapper {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }
        .om-video-bg {
          position: absolute;
          opacity: 0.12;
          mix-blend-mode: screen;
        }
        .om-video-bg video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .om-video-1 {
          top: 0;
          left: 0;
          width: 100%;
          height: 80vh;
          opacity: 0.15;
          mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
        }
        .om-video-2 {
          top: 90vh;
          right: -5vw;
          width: 40vw;
          height: 60vh;
          border-radius: 50%;
          mask-image: radial-gradient(circle, black 30%, transparent 70%);
          -webkit-mask-image: radial-gradient(circle, black 30%, transparent 70%);
        }
        .om-video-3 {
          top: 150vh;
          left: -5vw;
          width: 40vw;
          height: 40vw;
          mask-image: radial-gradient(circle, black 40%, transparent 70%);
          -webkit-mask-image: radial-gradient(circle, black 40%, transparent 70%);
        }
        .om-video-4 {
          bottom: 0;
          right: 0;
          width: 60vw;
          height: 60vh;
          opacity: 0.15;
          mask-image: radial-gradient(circle at bottom right, black 20%, transparent 80%);
          -webkit-mask-image: radial-gradient(circle at bottom right, black 20%, transparent 80%);
        }
        .om-fade {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .om-fade.om-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* NAV */
        .om-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 48px;
          height: 60px;
          border-bottom: 1px solid #1e1e1e;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(8px);
        }
        .om-nav-logo {
          font-family: 'Space Mono', monospace;
          font-size: 20px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          font-weight: 800;
          background: linear-gradient(90deg, #fff 0%, #888 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .om-nav-links {
          display: flex;
          gap: 40px;
          list-style: none;
          margin: 0; padding: 0;
        }
        .om-nav-links a {
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #999;
          text-decoration: none;
          transition: color 0.2s;
        }
        .om-nav-links a:hover { color: #fff; }
        .om-nav-cta {
          font-family: 'Space Mono', monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #000;
          background: #fff;
          border: none;
          padding: 10px 24px;
          cursor: pointer;
          transition: background 0.2s;
          text-decoration: none;
        }
        .om-nav-cta:hover { background: #e0e0e0; }

        /* HERO */
        .om-hero {
          position: relative;
          z-index: 10;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 120px 48px 80px;
          max-width: 1280px;
          margin: 0 auto;
        }
        .om-eyebrow {
          font-family: 'Space Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #555;
          margin-bottom: 40px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .om-eyebrow::before {
          content: '';
          display: block;
          width: 32px;
          height: 1px;
          background: #555;
        }
        .om-headline {
          font-size: clamp(48px, 6vw, 90px);
          font-weight: 700;
          line-height: 1.0;
          letter-spacing: -0.03em;
          margin-bottom: 48px;
          max-width: 1000px;
        }
        .om-brand-huge {
          display: block;
          font-size: clamp(80px, 16vw, 240px);
          font-weight: 900;
          letter-spacing: -0.06em;
          line-height: 0.8;
          margin-bottom: 24px;
          margin-left: -6px;
          background: linear-gradient(180deg, #ffffff 0%, #555555 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-transform: uppercase;
        }
        .om-headline-muted { color: #666; }
        .om-sub {
          font-size: 16px;
          line-height: 1.7;
          color: #888;
          max-width: 480px;
          margin-bottom: 64px;
          font-weight: 300;
        }
        .om-actions { display: flex; gap: 16px; align-items: center; }
        .om-btn-primary {
          font-family: 'Space Mono', monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #000;
          background: #fff;
          border: none;
          padding: 16px 36px;
          cursor: pointer;
          transition: background 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          box-shadow: 0 0 20px rgba(255,255,255,0.05);
        }
        .om-btn-primary:hover { 
          background: #e0e0e0; 
          box-shadow: 0 0 30px rgba(255,255,255,0.2);
        }
        .om-btn-secondary {
          font-family: 'Space Mono', monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #888;
          background: transparent;
          border: 1px solid #2a2a2a;
          padding: 16px 36px;
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s;
        }
        .om-btn-secondary:hover { color: #fff; border-color: #555; }

        /* TICKER */
        .om-ticker-wrap {
          position: relative;
          z-index: 10;
          border-top: 1px solid #1e1e1e;
          border-bottom: 1px solid #1e1e1e;
          background: #0d0d0d;
          overflow: hidden;
          padding: 14px 0;
        }
        .om-ticker-track {
          display: flex;
          width: max-content;
          animation: omTicker 28s linear infinite;
        }
        @keyframes omTicker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .om-ticker-item {
          font-family: 'Space Mono', monospace;
          font-size: 14px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #555;
          padding: 0 48px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .om-ticker-val { color: #888; }
        .om-ticker-sep { color: #2a2a2a; font-size: 18px; line-height: 1; align-self: center; }

        /* STATS */
        .om-stats {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 80px 48px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border-bottom: 1px solid #1e1e1e;
        }
        .om-stat {
          padding: 0 40px 0 0;
          border-right: 1px solid #1e1e1e;
        }
        .om-stat:last-child { border-right: none; padding-right: 0; padding-left: 40px; }
        .om-stat:not(:first-child):not(:last-child) { padding: 0 40px; }
        .om-stat-label {
          font-family: 'Space Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #555;
          margin-bottom: 12px;
        }
        .om-stat-value {
          font-size: 36px;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1;
          margin-bottom: 8px;
        }
        .om-stat-desc { font-size: 15px; color: #555; line-height: 1.5; font-weight: 300; }

        /* BUILDER */
        .om-builder {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 96px 48px 24px;
        }
        .om-builder-grid {
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: 24px;
        }
        .om-builder-panel {
          background: #050505;
          border: 1px solid #1e1e1e;
          padding: 32px;
        }
        .om-builder-kicker {
          font-family: 'Space Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #666;
          margin-bottom: 16px;
        }
        .om-builder-title {
          font-size: clamp(30px, 3vw, 44px);
          font-weight: 700;
          line-height: 1.08;
          letter-spacing: -0.03em;
          margin-bottom: 14px;
        }
        .om-builder-copy {
          color: #888;
          line-height: 1.7;
          font-size: 15px;
          margin-bottom: 28px;
          max-width: 56ch;
        }
        .om-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .om-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .om-field.full { grid-column: 1 / -1; }
        .om-label {
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #666;
        }
        .om-input, .om-select, .om-textarea {
          width: 100%;
          border: 1px solid #232323;
          background: #0b0b0b;
          color: #fff;
          padding: 14px 14px;
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .om-input:focus, .om-select:focus, .om-textarea:focus {
          border-color: #666;
          background: #101010;
        }
        .om-textarea {
          min-height: 104px;
          resize: vertical;
        }
        .om-samples {
          display: grid;
          gap: 12px;
          margin-top: 18px;
        }
        .om-sample {
          width: 100%;
          text-align: left;
          border: 1px solid #232323;
          background: #090909;
          color: #ddd;
          padding: 16px 18px;
          cursor: pointer;
          transition: border-color 0.2s, transform 0.2s, background 0.2s;
        }
        .om-sample:hover {
          border-color: #555;
          background: #111;
          transform: translateY(-1px);
        }
        .om-sample strong {
          display: block;
          font-size: 15px;
          color: #fff;
          margin-bottom: 6px;
        }
        .om-sample span {
          display: block;
          color: #777;
          line-height: 1.5;
          font-size: 13px;
        }
        .om-builder-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          margin-top: 24px;
        }
        .om-summary-list {
          display: grid;
          gap: 14px;
          margin: 24px 0 0;
          padding: 0;
          list-style: none;
        }
        .om-summary-item {
          border-top: 1px solid #1c1c1c;
          padding-top: 14px;
        }
        .om-summary-item:first-child {
          border-top: none;
          padding-top: 0;
        }
        .om-summary-label {
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #666;
          margin-bottom: 8px;
        }
        .om-summary-value {
          font-size: 15px;
          color: #fff;
          line-height: 1.6;
        }

        /* FEATURES */
        .om-features {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 120px 48px;
        }
        .om-journey {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 48px 120px;
        }
        .om-section-header {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          margin-bottom: 80px;
          align-items: end;
          border-bottom: 1px solid #1e1e1e;
          padding-bottom: 48px;
        }
        .om-section-title {
          font-size: clamp(32px, 3.5vw, 52px);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }
        .om-section-desc { font-size: 15px; color: #888; line-height: 1.7; font-weight: 300; }
        .om-features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
        }
        .om-feature {
          padding: 48px 40px 48px 0;
          border-right: 1px solid #1e1e1e;
          border-bottom: 1px solid #1e1e1e;
          transition: background 0.2s;
        }
        .om-feature:hover { background: #080808; }
        .om-feature:nth-child(2) { padding: 48px 40px; }
        .om-feature:nth-child(3) { border-right: none; padding: 48px 0 48px 40px; }
        .om-feature-index {
          font-family: 'Space Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.2em;
          color: #555;
          margin-bottom: 32px;
        }
        .om-feature-title {
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.02em;
          margin-bottom: 16px;
        }
        .om-feature-desc { font-size: 16px; color: #888; line-height: 1.75; font-weight: 300; }
        .om-journey-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1px;
          background: #1e1e1e;
          border: 1px solid #1e1e1e;
        }
        .om-journey-card {
          background: #050505;
          padding: 36px;
        }
        .om-journey-card h3 {
          margin: 0 0 10px;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.02em;
        }
        .om-journey-card p {
          margin: 0 0 24px;
          color: #888;
          line-height: 1.7;
          font-size: 15px;
        }
        .om-step-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 12px;
        }
        .om-step {
          display: grid;
          grid-template-columns: 24px 1fr;
          gap: 12px;
          align-items: start;
          color: #d8d8d8;
          line-height: 1.6;
          font-size: 15px;
        }
        .om-step span {
          font-family: 'Space Mono', monospace;
          color: #666;
          font-size: 12px;
          letter-spacing: 0.15em;
          padding-top: 2px;
        }
        .om-step strong { color: #fff; font-weight: 500; }

        /* CTA */
        .om-cta {
          position: relative;
          z-index: 10;
          border-top: 1px solid #1e1e1e;
          padding: 120px 48px;
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 80px;
        }
        .om-cta-headline {
          font-size: clamp(36px, 4vw, 64px);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.05;
          max-width: 600px;
        }
        .om-cta-right {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: flex-end;
        }
        .om-cta-note {
          font-family: 'Space Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #555;
        }

        /* FOOTER */
        .om-footer {
          position: relative;
          z-index: 10;
          border-top: 1px solid #1e1e1e;
          padding: 32px 48px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .om-footer span {
          font-family: 'Space Mono', monospace;
          font-size: 13px;
          color: #555;
          letter-spacing: 0.08em;
        }
      `}</style>

      <div className="om-root">
        <div className="om-bg-wrapper">
          <div className="om-video-bg om-video-1">
            <video src="/bg1.mp4" autoPlay loop muted playsInline />
          </div>
          <div className="om-video-bg om-video-2">
            <video src="/bg2.mp4" autoPlay loop muted playsInline />
          </div>
          <div className="om-video-bg om-video-3">
            <video src="/bg3.mp4" autoPlay loop muted playsInline />
          </div>
          <div className="om-video-bg om-video-4">
            <video src="/bg4.mp4" autoPlay loop muted playsInline />
          </div>
        </div>

        {/* NAV */}
        <nav className="om-nav">
          <div className="om-nav-logo">Thymos</div>
          <ul className="om-nav-links">
            <li><a href="#architecture">Architecture</a></li>
            <li><a href="#features">Capabilities</a></li>
            <li><a href="#network">Network</a></li>
          </ul>
          <Link to="/dashboard" className="om-nav-cta">Launch App →</Link>
        </nav>

        {/* HERO */}
        <section className="om-hero">
          <div className="om-eyebrow om-fade">Somnia Agentic L1 — 2026</div>
          <h1 className="om-headline om-fade">
            <span className="om-brand-huge">THYMOS</span>
            The Permissionless<br />
            <span className="om-headline-muted">Labor Market for</span><br />
            Autonomous Agents.
          </h1>
          <p className="om-sub om-fade">
            Post an outcome. Agents compete to solve it. Pay only on verified
            execution — deterministic settlement on Somnia's L1.
          </p>
          <div className="om-actions om-fade">
            <button className="om-btn-primary">
              Access Terminal
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 7h10M8 3l4 4-4 4" />
              </svg>
            </button>
            <button className="om-btn-secondary">View Source</button>
          </div>
        </section>

        {/* TICKER */}
        <div className="om-ticker-wrap">
          <div className="om-ticker-track">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={i} style={{ display: "contents" }}>
                <div className="om-ticker-item">
                  {item[0]} <span className="om-ticker-val">{item[1]}</span>
                </div>
                <div className="om-ticker-sep">·</div>
              </span>
            ))}
          </div>
        </div>

        {/* STATS */}
        <div className="om-stats">
          {stats.map((s, i) => (
            <div
              key={i}
              className="om-stat om-fade"
              style={{ transitionDelay: `${i * 0.1}s` }}
            >
              <div className="om-stat-label">{s.label}</div>
              <div className="om-stat-value">{s.value}</div>
              <div className="om-stat-desc">{s.desc}</div>
            </div>
          ))}
        </div>

        {/* BUILDER */}
        <section id="network" className="om-builder">
          <div className="om-builder-grid">
            <div className="om-builder-panel om-fade">
              <div className="om-builder-kicker">Interactive Mandate Studio</div>
              <h2 className="om-builder-title">Write the mandate like a user, not a script.</h2>
              <p className="om-builder-copy">
                Pick a preset or tune the numbers yourself. The app stores your draft locally so the dashboard
                can reflect what you entered, and the live demo can still run the on-chain scenario underneath.
              </p>

              <div className="om-form-grid">
                <label className="om-field full">
                  <span className="om-label">Mandate Label</span>
                  <input
                    className="om-input"
                    value={draft.label}
                    onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                    placeholder="Treasury Shield"
                  />
                </label>
                <label className="om-field">
                  <span className="om-label">Amount (USDC)</span>
                  <input
                    className="om-input"
                    value={draft.amount}
                    onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                    inputMode="decimal"
                    placeholder="100"
                  />
                </label>
                <label className="om-field">
                  <span className="om-label">Trigger Price</span>
                  <input
                    className="om-input"
                    value={draft.triggerPrice}
                    onChange={(event) => setDraft({ ...draft, triggerPrice: event.target.value })}
                    inputMode="decimal"
                    placeholder="0.985"
                  />
                </label>
                <label className="om-field">
                  <span className="om-label">Max Slippage</span>
                  <input
                    className="om-input"
                    value={draft.maxSlippageBps}
                    onChange={(event) => setDraft({ ...draft, maxSlippageBps: event.target.value })}
                    inputMode="numeric"
                    placeholder="50"
                  />
                </label>
                <label className="om-field">
                  <span className="om-label">Bounty (STT)</span>
                  <input
                    className="om-input"
                    value={draft.bounty}
                    onChange={(event) => setDraft({ ...draft, bounty: event.target.value })}
                    inputMode="decimal"
                    placeholder="0.05"
                  />
                </label>
                <label className="om-field">
                  <span className="om-label">Expiry (minutes)</span>
                  <input
                    className="om-input"
                    value={draft.expiryMinutes}
                    onChange={(event) => setDraft({ ...draft, expiryMinutes: event.target.value })}
                    inputMode="numeric"
                    placeholder="60"
                  />
                </label>
                <label className="om-field">
                  <span className="om-label">Output Asset</span>
                  <select
                    className="om-select"
                    value={draft.outputAsset}
                    onChange={(event) => setDraft({ ...draft, outputAsset: event.target.value })}
                  >
                    <option value="mDAI">mDAI</option>
                    <option value="mUSDC">mUSDC</option>
                    <option value="wstSTT">wstSTT</option>
                  </select>
                </label>
                <label className="om-field full">
                  <span className="om-label">Notes</span>
                  <textarea
                    className="om-textarea"
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    placeholder="Anything the operator should know?"
                  />
                </label>
              </div>

              <div className="om-builder-actions">
                <button type="button" className="om-btn-primary" onClick={launchDraft}>
                  Save Draft
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 7h10M8 3l4 4-4 4" />
                  </svg>
                </button>
                <Link to="/dashboard" className="om-btn-secondary">
                  Open Live Trace
                </Link>
              </div>
              <p className="om-builder-copy" style={{ marginTop: "16px", marginBottom: 0 }}>
                The live on-chain demo still runs from the terminal with <code>npm run demo:once</code>.
                Saving a draft updates the dashboard preview and keeps the selected mandate ready for the next run.
              </p>
            </div>

            <div className="om-builder-panel om-fade" style={{ transitionDelay: "0.08s" }}>
              <div className="om-builder-kicker">Sample Mandates</div>
              <h2 className="om-builder-title" style={{ fontSize: "clamp(24px, 2.5vw, 32px)" }}>
                Start with a tested preset.
              </h2>
              <p className="om-builder-copy">
                These are ready-to-use templates for the demo. One click fills the form, so you can test the UI
                immediately without having to think through every parameter from scratch.
              </p>

              <div className="om-samples">
                {sampleMandates.map((sample) => (
                  <button key={sample.id} type="button" className="om-sample" onClick={() => setSample(sample.id)}>
                    <strong>{sample.title}</strong>
                    <span>{sample.description}</span>
                  </button>
                ))}
              </div>

              <ul className="om-summary-list">
                <li className="om-summary-item">
                  <div className="om-summary-label">Current Draft</div>
                  <div className="om-summary-value">{draft.label}</div>
                </li>
                <li className="om-summary-item">
                  <div className="om-summary-label">Quick Stats</div>
                  <div className="om-summary-value">{draftSummary.join(" · ")}</div>
                </li>
                <li className="om-summary-item">
                  <div className="om-summary-label">Notes</div>
                  <div className="om-summary-value">{draft.notes}</div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="om-features">
          <div className="om-section-header om-fade">
            <h2 className="om-section-title">Architecture<br />of Autonomy</h2>
            <p className="om-section-desc">
              Three primitives, built natively on Somnia, compose into a system
              no prior infrastructure could support. No oracles. No operators.
              No trust assumptions.
            </p>
          </div>
          <div className="om-features-grid">
            {features.map((f, i) => (
              <div
                key={i}
                className="om-feature om-fade"
                style={{ transitionDelay: `${i * 0.1}s` }}
              >
                <div className="om-feature-index">{f.index}</div>
                <div className="om-feature-title">{f.title}</div>
                <p className="om-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* JOURNEY */}
        <section className="om-journey">
          <div className="om-section-header om-fade">
            <h2 className="om-section-title">End-to-End Automation,<br />No Human Bottlenecks</h2>
            <p className="om-section-desc">
              Thymos orchestrates the entire lifecycle of treasury defense. 
              From the moment a depeg is detected to the final settlement and bounty payout, 
              the protocol operates entirely autonomously on-chain.
            </p>
          </div>
          <div className="om-journey-grid">
            {journey.map((track, trackIndex) => (
              <div key={trackIndex} className="om-journey-card om-fade" style={{ transitionDelay: `${trackIndex * 0.1}s` }}>
                <div className="om-feature-index">{trackIndex === 0 ? "DAO EXPERIENCE" : "AGENT NETWORK"}</div>
                <h3>{track.title}</h3>
                <p>{track.summary}</p>
                <ol className="om-step-list">
                  {track.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="om-step">
                      <span>{String(stepIndex + 1).padStart(2, "0")}</span>
                      <strong>{step}</strong>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* CLOSING CTA */}
        <div className="om-cta">
          <h2 className="om-cta-headline om-fade">
            Post an Outcome.<br />
            <span className="om-headline-muted">Let the Network</span><br />
            Do the Work.
          </h2>
          <div className="om-cta-right om-fade">
            <Link to="/dashboard" className="om-btn-primary">
              Access Terminal
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 7h10M8 3l4 4-4 4" />
              </svg>
            </Link>
            <span className="om-cta-note">Somnia Testnet — Live</span>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="om-footer">
          <span>© 2026 Thymos</span>
          <span>Securing the decentralized future.</span>
        </footer>
      </div>
    </>
  );
}
