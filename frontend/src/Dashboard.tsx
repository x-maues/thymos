import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

// --- TYPES ---
type TimelineItem = {
  time: string;
  kind: string;
  title: string;
  detail: string;
  txHash?: string;
};

type EvidenceRecord = {
  mandateId: string;
  agent: string;
  sourceId: string;
  priceE6: string;
  observedAt: string;
  valid: boolean;
  evidenceHash: string;
  txHash?: string;
};

type ProposalRecord = {
  mandateId: string;
  agent: string;
  outputToken: string;
  expectedOutput: string;
  slippageBps: number;
  routeHash: string;
  valid: boolean;
  txHash?: string;
};

type DemoState = {
  status: string;
  network: string;
  mode?: "SOMNIA";
  proofLabel?: string;
  mandateId?: string;
  contracts: Record<string, string>;
  agents: Record<string, string>;
  balances: { input: string; output: string; bountyPaid: string };
  lifi: { status: string; detail: string; expectedOutput?: string };
  streams?: {
    transport?: "SOMNIA_DATA_STREAMS" | "SOMNIA_DATA_STREAMS_FAILED";
    evidenceSchema?: string;
    proposalSchema?: string;
    evidenceSchemaId?: string;
    proposalSchemaId?: string;
    publishTxs?: string[];
    errors?: string[];
    evidence: EvidenceRecord[];
    proposals: ProposalRecord[];
  };
  timeline: TimelineItem[];
  updatedAt: string;
};

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

const emptyState: DemoState = {
  status: "WAITING",
  network: "Thymos",
  mode: "SOMNIA",
  proofLabel: "Somnia explorer proof",
  contracts: {},
  agents: {},
  balances: { input: "0.00", output: "0.00", bountyPaid: "0" },
  lifi: { status: "PENDING", detail: "Run npm run demo" },
  streams: { transport: "SOMNIA_DATA_STREAMS", publishTxs: [], errors: [], evidence: [], proposals: [] },
  timeline: [],
  updatedAt: new Date().toISOString(),
};

const explorerBase = "https://shannon-explorer.somnia.network";

// --- UTILS ---
function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "pending";
}

// --- EXPLORER ROUTING FIX ---
function proofUrl(value: string | undefined, isSomnia: boolean) {
  if (!isSomnia || !value) return undefined;

  // Clean up any potential layout/whitespace characters
  const cleanValue = value.trim();

  // If it's a full 66-character transaction hash (0x + 64 hex chars)
  if (cleanValue.startsWith("0x") && cleanValue.length === 66) {
    return `${explorerBase}/tx/${cleanValue}`;
  }

  // If it's a standard 42-character Ethereum/Somnia address
  if (cleanValue.startsWith("0x") && cleanValue.length === 42) {
    return `${explorerBase}/address/${cleanValue}`;
  }

  return undefined;
}

function ProofLink({ value, isSomnia }: { value?: string; isSomnia: boolean }) {
  const href = proofUrl(value, isSomnia);
  if (!value) return <code className="font-mono text-zinc-500 text-xs uppercase tracking-widest">[ PENDING ]</code>;
  if (!href) return <code className="font-mono text-white text-xs uppercase tracking-widest">{shortAddress(value)}</code>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono text-xs font-bold text-white hover:bg-white hover:text-black border border-white/20 hover:border-white px-2 py-1 transition-colors duration-200">
      {shortAddress(value)} ↗
    </a>
  );
}

// --- STYLES & THEME CONTROLS ---
const customStyles = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
.font-sans { font-family: 'Space Grotesk', sans-serif; }
.font-mono { font-family: 'Space Mono', monospace; }

@keyframes scan {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100vh); }
}
.bg-grid {
  background-image: 
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 80px 80px;
  background-position: center center;
}
.anim-block { animation: fade 4s ease-in-out infinite alternate; }
.anim-block:nth-child(2) { animation-delay: 1.5s; }
.anim-block:nth-child(3) { animation-delay: 3s; }
@keyframes fade {
  0% { opacity: 0; }
  100% { opacity: 0.05; }
}

/* ─── CENTRAL CARD/BOX DESIGN CONTROL ─── */
.dashboard-card {
  /* EDIT THESE VALUES TO CHANGE BOX COLORS GLOBALLY */
  background-color: rgba(15, 15, 18, 0.70); /* Main background color & opacity */
  border: 1px solid rgba(255, 255, 255, 0.08); /* Border color & opacity */
  backdrop-filter: blur(8px);                 /* Glassmorphism blur depth */
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.dashboard-card:hover {
  background-color: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.15);
}
`;

export default function Dashboard() {
  const [state, setState] = useState<DemoState>(emptyState);
  const [draft, setDraft] = useState<MandateDraft | null>(null);

  // Poll for Demo State
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/demo-state.json?t=${Date.now()}`);
        if (response.ok && active) setState(await response.json());
      } catch {
        // Silent catch while waiting for demo script to boot
      }
    };
    load();
    const timer = window.setInterval(load, 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (raw) setDraft(JSON.parse(raw) as MandateDraft);
    } catch {
      setDraft(null);
    }
  }, []);

  const latestTx = useMemo(
    () => [...state.timeline].reverse().find((item) => item.txHash)?.txHash,
    [state.timeline]
  );

  const isComplete = state.status === "COMPLETED";
  const isSomnia = true;
  const streams = state.streams ?? emptyState.streams!;

  return (
    <>
      <style>{customStyles}</style>
      <div className="relative min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black overflow-hidden flex flex-col">

        {/* --- BACKGROUND EFFECTS --- */}
        <div className="fixed inset-0 z-0 bg-grid pointer-events-none"></div>
        <div className="fixed inset-0 z-0 pointer-events-none flex justify-center">
          <div className="w-[80px] h-[80px] bg-white absolute top-[20%] left-[15%] anim-block"></div>
          <div className="w-[160px] h-[80px] bg-white absolute top-[60%] right-[10%] anim-block"></div>
        </div>
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden opacity-10">
          <div className="w-full h-[1px] bg-white shadow-[0_0_15px_rgba(255,255,255,1)]" style={{ animation: 'scan 8s linear infinite' }}></div>
        </div>

        {/* ── TOP NAVIGATION ── */}
        <header className="relative z-10 w-full border-b border-white/10 bg-black/80 backdrop-blur-md">
          <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 ${state.status === "WAITING" ? "bg-zinc-700" : "bg-white animate-pulse shadow-[0_0_10px_white]"}`}></div>
                <strong className="font-mono text-sm tracking-[0.2em] uppercase text-white font-bold">Thymos</strong>
              </div>
              <nav className="hidden md:flex gap-8">
                <Link to="/" className="font-mono text-[11px] tracking-widest text-zinc-400 hover:text-white font-bold transition-colors uppercase">← Exit System</Link>
                <a href="#trace" className="font-mono text-[11px] tracking-widest text-zinc-400 hover:text-white font-bold transition-colors uppercase">// Trace</a>
                <a href="#streams" className="font-mono text-[11px] tracking-widest text-zinc-400 hover:text-white font-bold transition-colors uppercase">// Streams</a>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="px-4 py-2 border border-white/20 bg-black font-mono text-[10px] tracking-[0.15em] uppercase flex items-center gap-3">
                <span className="text-zinc-500 font-bold">SYSTEM STATUS:</span>
                <span className={`font-bold ${isComplete ? "text-white" : "text-white animate-pulse"}`}>
                  {state.status}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* ── MAIN DASHBOARD GRID ── */}
        <main className="relative z-10 max-w-[1600px] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">

          {/* LEFT COLUMN: Summary & Trace (Span 8) */}
          <div className="lg:col-span-8 flex flex-col gap-6">

            {draft && (
              <article className="dashboard-card p-6">
                <div className="flex justify-between items-start gap-4 mb-6">
                  <div>
                    <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">User Draft</span>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white uppercase">{draft.label}</h2>
                  </div>
                  <span className="font-mono text-[10px] font-bold tracking-widest uppercase text-black bg-white px-2 py-1">PREVIEW</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="border border-white/10 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Amount</div>
                    <div className="font-bold text-white">{draft.amount} USDC</div>
                  </div>
                  <div className="border border-white/10 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Trigger</div>
                    <div className="font-bold text-white">${draft.triggerPrice}</div>
                  </div>
                  <div className="border border-white/10 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Slippage</div>
                    <div className="font-bold text-white">{(Number(draft.maxSlippageBps) / 100).toFixed(2)}%</div>
                  </div>
                  <div className="border border-white/10 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Expiry</div>
                    <div className="font-bold text-white">{draft.expiryMinutes} min</div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
                  {draft.notes}
                </p>
              </article>
            )}

            {/* TOP ROW: Mandate & Outcome */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Active Mandate Panel */}
              <article className="dashboard-card p-8 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-8">
                  <span className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500">Active Mandate #{state.mandateId ?? "—"}</span>
                  <span className="font-mono text-[10px] font-bold tracking-widest uppercase text-black bg-white px-2 py-1">{state.network}</span>
                </div>

                <h2 className="text-3xl md:text-4xl font-bold tracking-tighter text-white mb-8">STABLECOIN RESCUE</h2>

                <div className="space-y-6 mb-8">
                  <div className="flex flex-col border-l-2 border-zinc-700 pl-4">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-zinc-500 mb-2">// CONDITION</span>
                    <span className="text-lg font-medium text-white leading-tight">USDC trades below $0.985 on two distinct sources.</span>
                  </div>
                  <div className="flex flex-col border-l-2 border-zinc-700 pl-4">
                    <span className="font-mono text-[10px] font-bold tracking-widest text-zinc-500 mb-2">// EXECUTION</span>
                    <span className="text-lg font-medium text-white leading-tight">Route 100 USDC into approved defensive asset.</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/10">
                  <div>
                    <span className="block font-mono text-[10px] font-bold tracking-widest text-zinc-500 mb-2">MAX SLIPPAGE</span>
                    <strong className="text-base font-mono text-white">0.50%</strong>
                  </div>
                  <div>
                    <span className="block font-mono text-[10px] font-bold tracking-widest text-zinc-500 mb-2">BOUNTY</span>
                    <strong className="text-base font-mono text-white">0.05 STT</strong>
                  </div>
                  <div>
                    <span className="block font-mono text-[10px] font-bold tracking-widest text-zinc-500 mb-2">LATEST TX</span>
                    <ProofLink value={latestTx} isSomnia={isSomnia} />
                  </div>
                </div>
              </article>

              {/* Treasury Outcome Panel */}
              <article className="dashboard-card p-8 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-8">
                  <span className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500">Treasury State</span>
                  <span className={`font-mono text-[10px] font-bold tracking-widest uppercase ${isComplete ? 'text-white' : 'text-zinc-500 animate-pulse'}`}>{isComplete ? 'SECURED' : 'AT RISK'}</span>
                </div>

                <div className="space-y-8 mb-8">
                  <div className="flex justify-between items-end border-b border-white/10 pb-4">
                    <span className="text-lg font-medium text-zinc-400">Risk Asset</span>
                    <strong className="font-mono text-5xl tracking-tighter text-white">{state.balances.input} <span className="text-sm tracking-normal text-zinc-500 ml-1">mUSDC</span></strong>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/10 pb-4">
                    <span className="text-lg font-medium text-zinc-400">Defensive Asset</span>
                    <strong className="font-mono text-5xl tracking-tighter text-white">{state.balances.output} <span className="text-sm tracking-normal text-zinc-500 ml-1">mDAI</span></strong>
                  </div>
                </div>

                <div>
                  <div className="w-full h-[2px] bg-zinc-900 mb-4 overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ease-out ${isComplete ? 'bg-white shadow-[0_0_10px_white]' : 'bg-zinc-500'}`} style={{ width: isComplete ? "100%" : "15%" }}></div>
                  </div>
                  <p className="font-mono text-[10px] font-bold tracking-widest uppercase text-zinc-400">
                    {isComplete ? "> Mandate fulfilled. Agent paid." : "> Awaiting autonomous triggers..."}
                  </p>
                </div>
              </article>

            </div>

            {/* TRACE PANEL */}
            <article id="trace" className="dashboard-card p-8 flex-1">
              <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-8">
                <div>
                  <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">Live Autonomous Trace</span>
                  <h2 className="text-3xl font-bold tracking-tight text-white uppercase">Execution Log</h2>
                </div>
                <span className="font-mono text-[11px] font-bold text-black bg-white px-3 py-1 uppercase tracking-widest">{state.timeline.length} Events</span>
              </div>

              <div className="space-y-0 relative">
                {/* Vertical line connecting events */}
                {state.timeline.length > 0 && <div className="absolute left-[5px] top-4 bottom-4 w-px bg-white/10 z-0"></div>}

                {state.timeline.length === 0 && (
                  <div className="py-16 text-center border border-white/10 text-zinc-500 font-mono text-xs uppercase tracking-widest">
                    Run <code className="text-white border border-white/20 px-2 py-1 mx-2">npm run demo</code> to initialize network.
                  </div>
                )}

                {[...state.timeline].reverse().map((item, index) => {
                  let dotColor = "bg-zinc-600";
                  if (item.kind === "system" || item.kind === "evidence") dotColor = "bg-white";
                  if (item.kind === "rejected") dotColor = "bg-red-500";
                  if (item.kind === "proposal") dotColor = "bg-zinc-400";
                  if (item.kind === "execution" || item.kind === "payout") dotColor = "bg-white shadow-[0_0_10px_white]";

                  return (
                    <div className="relative pl-8 pb-8 last:pb-2 z-10" key={index}>
                      <div className={`absolute left-0 top-1.5 w-3 h-3 border border-black ${dotColor}`}></div>

                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
                        <strong className="text-lg font-bold text-white tracking-tight uppercase">{item.title}</strong>
                        <time className="font-mono text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{new Date(item.time).toLocaleTimeString()}</time>
                      </div>
                      <p className="text-base text-zinc-400 leading-relaxed mb-4 max-w-3xl font-medium">{item.detail}</p>

                      {item.txHash && (
                        <div className="inline-flex items-center gap-4">
                          <span className="font-mono text-[10px] font-bold text-zinc-500 uppercase tracking-widest">RECEIPT:</span>
                          <ProofLink value={item.txHash} isSomnia={isSomnia} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>

          </div>

          {/* RIGHT COLUMN: Sidebar (Span 4) */}
          <aside className="lg:col-span-4 flex flex-col gap-6">

            {/* Discovery Panel */}
            <article className="dashboard-card p-8">
              <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-6 border-b border-white/10 pb-4">Somnia Agent Call</span>

              <h3 className="text-xl font-bold text-white mb-4 uppercase">JSON API Request</h3>
              <p className="text-sm text-zinc-400 mb-8 leading-relaxed">{state.lifi.detail}</p>

              <div className="space-y-4 font-mono text-xs uppercase tracking-widest">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="text-zinc-500">Agent ID</span>
                  <span className="text-white">13174292974160097713</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="text-zinc-500">Platform</span>
                  <ProofLink value={state.contracts.SomniaAgents} isSomnia={isSomnia} />
                </div>
                {state.lifi.expectedOutput && (
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-zinc-500">Expected</span>
                    <span className="text-white border border-white/20 px-2 py-1">{state.lifi.expectedOutput}</span>
                  </div>
                )}
              </div>
            </article>

            {/* Proof Panel */}
            <article className="dashboard-card p-8">
              <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-6 border-b border-white/10 pb-4">{state.proofLabel ?? "Deployment Proof"}</span>
              <div className="space-y-4 font-mono text-xs uppercase tracking-widest">
                {[
                  ["Thymos Core", state.contracts.OpenMandate],
                  ["React Handler", state.contracts.ReactiveHandler],
                  ["Evidence Agent", state.contracts.SomniaEvidenceAgent],
                  ["Rescue Adapter", state.contracts.RescueAdapter],
                ].map(([name, address]) => (
                  <div className="flex justify-between items-center border-b border-white/10 pb-3 last:border-0 last:pb-0" key={name}>
                    <span className="text-zinc-500">{name}</span>
                    <ProofLink value={address} isSomnia={isSomnia} />
                  </div>
                ))}
              </div>
            </article>

            {/* Agents Panel */}
            <article className="dashboard-card p-8">
              <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-6 border-b border-white/10 pb-4">Network Participants</span>
              <div className="space-y-4 font-mono text-xs uppercase tracking-widest">
                {Object.entries(state.agents).map(([name, address]) => (
                  <div className="flex justify-between items-center border-b border-white/10 pb-3 last:border-0 last:pb-0" key={name}>
                    <span className="text-zinc-500">{name}</span>
                    <ProofLink value={address} isSomnia={isSomnia} />
                  </div>
                ))}
              </div>
            </article>

          </aside>
        </main>

        {/* ── STREAMS DATA TABLES ── */}
        <section id="streams" className="relative z-10 max-w-[1600px] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-24">

          {/* Evidence Streams */}
          <article className="dashboard-card p-0 flex flex-col overflow-hidden">
            <div className="p-8 border-b border-white/10 flex justify-between items-end bg-black/40">
              <div>
                <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">// Somnia Data Streams</span>
                <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Evidence Records</h2>
              </div>
              <span className="font-mono text-[11px] font-bold text-black bg-white px-3 py-1 uppercase tracking-widest">{streams.evidence.length} Records</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px] uppercase tracking-widest whitespace-nowrap">
                <thead className="text-zinc-600 border-b border-white/10">
                  <tr>
                    <th className="px-8 py-5 font-normal">Status</th>
                    <th className="px-8 py-5 font-normal">Target</th>
                    <th className="px-8 py-5 font-normal">Value</th>
                    <th className="px-8 py-5 font-normal">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {streams.evidence.map((record, index) => (
                    <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-8 py-6">
                        <span className={`px-2 py-1 border ${record.valid ? "border-white text-white" : "border-zinc-800 text-zinc-500"}`}>
                          {record.valid ? "ACCEPTED" : "REJECTED"}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-zinc-400 font-bold">Mandate #{record.mandateId}</td>
                      <td className="px-8 py-6 text-white font-bold text-sm">
                        {Number(record.priceE6) ? `$${(Number(record.priceE6) / 1e6).toFixed(4)}` : "pending"}
                      </td>
                      <td className="px-8 py-6"><ProofLink value={record.txHash} isSomnia={isSomnia} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {streams.evidence.length === 0 && (
                <div className="p-12 text-center text-zinc-600 font-mono text-xs uppercase tracking-widest">Awaiting stream data...</div>
              )}
            </div>
          </article>

          {/* Proposal Streams */}
          <article className="dashboard-card p-0 flex flex-col overflow-hidden">
            <div className="p-8 border-b border-white/10 flex justify-between items-end bg-black/40">
              <div>
                <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500 mb-3">// Somnia Data Streams</span>
                <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Proposal Records</h2>
              </div>
              <span className="font-mono text-[11px] font-bold text-black bg-white px-3 py-1 uppercase tracking-widest">{streams.proposals.length} Records</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px] uppercase tracking-widest whitespace-nowrap">
                <thead className="text-zinc-600 border-b border-white/10">
                  <tr>
                    <th className="px-8 py-5 font-normal">Status</th>
                    <th className="px-8 py-5 font-normal">Expected Out</th>
                    <th className="px-8 py-5 font-normal">Slippage</th>
                    <th className="px-8 py-5 font-normal">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {streams.proposals.map((record, index) => (
                    <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-8 py-6">
                        <span className={`px-2 py-1 border ${record.valid ? "border-white text-white" : "border-red-900 text-red-500"}`}>
                          {record.valid ? "ACCEPTED" : "REJECTED"}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-white font-bold text-sm">{(Number(record.expectedOutput) / 1e6).toFixed(2)} mDAI</td>
                      <td className="px-8 py-6 text-zinc-400 font-bold">{(record.slippageBps / 100).toFixed(2)}%</td>
                      <td className="px-8 py-6"><ProofLink value={record.txHash} isSomnia={isSomnia} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {streams.proposals.length === 0 && (
                <div className="p-12 text-center text-zinc-600 font-mono text-xs uppercase tracking-widest">Awaiting stream data...</div>
              )}
            </div>

            {/* Stream Errors */}
            {(streams.errors?.length ?? 0) > 0 && (
              <div className="mt-auto border-t border-white/10 bg-black/50 p-6 flex items-start gap-4">
                <div className="w-2 h-2 mt-1.5 bg-red-500 rounded-none animate-pulse"></div>
                <div>
                  <span className="block font-mono text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-1">Stream Error</span>
                  <p className="font-mono text-xs text-zinc-300 uppercase tracking-wider">{streams.errors?.[streams.errors.length - 1]}</p>
                </div>
              </div>
            )}
          </article>
        </section>

      </div>
    </>
  );
}
