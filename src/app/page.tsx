
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans selection:bg-amber-500/30">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex justify-between items-end border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tighter text-white mb-2">PROVENIQ <span className="text-amber-500">TRANSIT</span></h1>
            <p className="text-slate-400 text-sm tracking-widest uppercase">The Chain // Secure Custody Logistics</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 font-mono">GUARD STATUS</div>
            <div className="text-amber-400 font-bold flex items-center justify-end gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              SECURE
            </div>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Active Handoffs */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl min-h-[400px] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white">Active Custody Map</h2>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-xs rounded border border-amber-500/20">IN TRANSIT: 14</span>
                  <span className="px-2 py-1 bg-slate-800 text-slate-400 text-xs rounded border border-slate-700">PENDING: 3</span>
                </div>
              </div>
              {/* Mock Map Visualization */}
              <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 relative overflow-hidden group">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-700 via-slate-950 to-slate-950"></div>
                <div className="absolute top-1/2 left-1/3 w-3 h-3 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-ping"></div>
                <div className="absolute top-1/2 left-1/3 w-3 h-3 bg-amber-500 rounded-full"></div>
                <div className="absolute top-1/4 right-1/4 w-2 h-2 bg-slate-600 rounded-full"></div>
                <div className="absolute top-2/3 left-1/2 w-2 h-2 bg-slate-600 rounded-full"></div>

                <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur border border-slate-700 p-3 rounded text-xs">
                  <div className="text-amber-400 font-bold mb-1">ROUTE ID: TX-9928</div>
                  <div className="text-slate-400">CUSTODIAN: <span className="text-white">IronClad Logistics</span></div>
                  <div className="text-slate-400">ETA: <span className="text-white">45m</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-amber-500/50 transition-colors">
              <h2 className="text-lg font-semibold text-white mb-4">Execute Handoff</h2>
              <div className="space-y-3">
                <input type="text" placeholder="Challenge ID" className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm focus:border-amber-500 focus:outline-none transition-colors" />
                <input type="text" placeholder="Wallet Signature" className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm focus:border-amber-500 focus:outline-none transition-colors" />
                <button className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-slate-900 font-bold rounded-lg transition-all shadow-lg shadow-amber-900/20">
                  ACCEPT CUSTODY
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
              <h2 className="text-lg font-semibold text-white mb-4">Verification Terminals</h2>
              <div className="space-y-2 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span>Terminal A (NY-JFK) - Online</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span>Terminal B (LDN-LHR) - Online</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                  <span>Terminal C (SGP-SIN) - Offline</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
