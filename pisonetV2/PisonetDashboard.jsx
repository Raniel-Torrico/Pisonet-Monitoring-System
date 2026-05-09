import { useState, useEffect, useRef } from "react";

// ─── Mock data (replace with real Axios calls to your PHP endpoints) ──────────
const MOCK_MACHINES = [
  { id: 1, name: "PC-01", status: "active",  cpu: 34, ram: 52, remaining: 1740, session_id: 101 },
  { id: 2, name: "PC-02", status: "active",  cpu: 78, ram: 81, remaining: 620,  session_id: 102 },
  { id: 3, name: "PC-03", status: "idle",    cpu: 2,  ram: 18, remaining: 0,    session_id: null },
  { id: 4, name: "PC-04", status: "offline", cpu: 0,  ram: 0,  remaining: 0,    session_id: null },
  { id: 5, name: "PC-05", status: "active",  cpu: 55, ram: 63, remaining: 3000, session_id: 103 },
  { id: 6, name: "PC-06", status: "idle",    cpu: 3,  ram: 20, remaining: 0,    session_id: null },
];

const MOCK_INCOME = {
  today:   { label: "Today",   amount: 285 },
  week:    { label: "This Week", amount: 1840 },
  month:   { label: "This Month", amount: 6920 },
};

const MOCK_ALERTS = [
  { id: 1, type: "offline", message: "PC-04 went offline", time: "2 min ago" },
  { id: 2, type: "cpu",     message: "PC-02 CPU at 78%",   time: "5 min ago" },
  { id: 3, type: "idle",    message: "PC-03 idle for 20 min", time: "20 min ago" },
];

// ─── Helper: format seconds → mm:ss ──────────────────────────────────────────
function fmtTime(s) {
  if (!s) return "--:--";
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    active:  { bg: "#dcfce7", color: "#166534", dot: "#16a34a", label: "Active"  },
    idle:    { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af", label: "Idle"    },
    offline: { bg: "#fee2e2", color: "#991b1b", dot: "#ef4444", label: "Offline" },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5,
      background:s.bg, color:s.color, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:600 }}>
      <span style={{ width:6,height:6,borderRadius:"50%",background:s.dot,
        boxShadow: status==="active" ? `0 0 0 3px ${s.dot}30` : "none",
        animation: status==="active" ? "pulse 2s infinite" : "none" }}/>
      {s.label}
    </span>
  );
}

// ─── Mini bar for CPU / RAM ───────────────────────────────────────────────────
function MiniBar({ value, color }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ flex:1, height:5, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
        <div style={{ width:`${value}%`, height:"100%", background:color, borderRadius:3,
          transition:"width 0.5s ease" }}/>
      </div>
      <span style={{ fontSize:11, color:"#6b7280", width:28, textAlign:"right" }}>{value}%</span>
    </div>
  );
}

// ─── Machine Card ─────────────────────────────────────────────────────────────
function MachineCard({ machine, onCommand }) {
  const isOff = machine.status === "offline";
  return (
    <div style={{
      background: "white", borderRadius:12, padding:16,
      border: machine.status==="active" ? "1.5px solid #bbf7d0" :
              machine.status==="offline" ? "1.5px solid #fecaca" : "1.5px solid #e5e7eb",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)", transition:"box-shadow 0.2s"
    }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontWeight:700, fontSize:15, color:"#111827" }}>{machine.name}</span>
        <StatusBadge status={machine.status}/>
      </div>

      {/* Metrics */}
      {!isOff && (
        <div style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#6b7280", marginBottom:3 }}>
            <span>CPU</span>
          </div>
          <MiniBar value={machine.cpu} color={machine.cpu>70?"#ef4444":"#10b981"}/>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#6b7280", marginTop:6, marginBottom:3 }}>
            <span>RAM</span>
          </div>
          <MiniBar value={machine.ram} color={machine.ram>80?"#f59e0b":"#3b82f6"}/>
        </div>
      )}

      {/* Timer */}
      <div style={{ background: machine.status==="active"?"#f0fdf4":"#f9fafb",
        borderRadius:8, padding:"8px 12px", marginBottom:10, textAlign:"center" }}>
        <div style={{ fontSize:11, color:"#6b7280", marginBottom:2 }}>Time Remaining</div>
        <div style={{ fontSize:22, fontWeight:800, letterSpacing:2,
          color: machine.status==="active"?(machine.remaining<300?"#ef4444":"#10b981"):"#9ca3af",
          fontVariantNumeric:"tabular-nums" }}>
          {fmtTime(machine.remaining)}
        </div>
      </div>

      {/* Command buttons */}
      <div style={{ display:"flex", gap:6 }}>
        {["shutdown","restart","lock"].map(cmd => (
          <button key={cmd} disabled={isOff}
            onClick={() => onCommand(machine.id, cmd)}
            style={{
              flex:1, fontSize:10, fontWeight:600, padding:"5px 0",
              borderRadius:6, border:"1px solid #e5e7eb",
              background: isOff?"#f9fafb":"white", color: isOff?"#d1d5db":"#374151",
              cursor: isOff?"not-allowed":"pointer", textTransform:"capitalize",
              transition:"background 0.15s"
            }}>
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Income Card ─────────────────────────────────────────────────────────────
function IncomeCard({ data }) {
  return (
    <div style={{ display:"flex", gap:12 }}>
      {Object.values(data).map(d => (
        <div key={d.label} style={{
          flex:1, background:"white", borderRadius:12, padding:"14px 16px",
          border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,0.05)"
        }}>
          <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>{d.label}</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#111827" }}>₱{d.amount.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Alert Item ───────────────────────────────────────────────────────────────
function AlertItem({ alert }) {
  const icons = { offline:"⚫", cpu:"🔴", idle:"🟡" };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0",
      borderBottom:"1px solid #f3f4f6" }}>
      <span style={{ fontSize:12 }}>{icons[alert.type]}</span>
      <span style={{ flex:1, fontSize:13, color:"#374151" }}>{alert.message}</span>
      <span style={{ fontSize:11, color:"#9ca3af" }}>{alert.time}</span>
    </div>
  );
}

// ─── Inline bar chart (no library needed) ────────────────────────────────────
function SimpleBarChart({ data }) {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:80, padding:"0 4px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
          <div style={{
            width:"100%", height: max ? (d.value/max)*70 : 4,
            background: "#10b981", borderRadius:"4px 4px 0 0",
            transition:"height 0.5s ease", minHeight:4
          }}/>
          <span style={{ fontSize:10, color:"#9ca3af" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PisonetDashboard() {
  const [machines, setMachines] = useState(MOCK_MACHINES);
  const [alerts, setAlerts]     = useState(MOCK_ALERTS);
  const [activeTab, setActiveTab] = useState("machines");
  const [toast, setToast]       = useState(null);
  const [pollStatus, setPollStatus] = useState("live");

  // ── Simulate polling (replace with real Axios calls) ──
  useEffect(() => {
    const interval = setInterval(() => {
      setPollStatus("syncing");
      // Simulate slight CPU fluctuation
      setMachines(prev => prev.map(m =>
        m.status === "active"
          ? { ...m, cpu: Math.max(5, Math.min(95, m.cpu + (Math.random()*10-5)|0)),
                    remaining: m.remaining > 0 ? m.remaining - 3 : 0 }
          : m
      ));
      setTimeout(() => setPollStatus("live"), 400);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ── Send command (replace with real API call) ──
  const handleCommand = (machineId, cmd) => {
    const machine = machines.find(m => m.id === machineId);
    showToast(`Sent "${cmd}" to ${machine.name}`);
    // TODO: POST to /api/command.php
    // await axios.post('/api/command.php', { machine_id: machineId, command: cmd });
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const activeMachines  = machines.filter(m => m.status === "active").length;
  const offlineMachines = machines.filter(m => m.status === "offline").length;
  const idleMachines    = machines.filter(m => m.status === "idle").length;

  const weeklyData = [
    {label:"Mon",value:240},{label:"Tue",value:185},{label:"Wed",value:320},
    {label:"Thu",value:290},{label:"Fri",value:410},{label:"Sat",value:580},{label:"Sun",value:520},
  ];

  const tabs = ["machines","analytics","alerts","logs"];

  return (
    <div style={{ fontFamily:"system-ui,-apple-system,sans-serif", background:"#f8fafc",
      minHeight:"100vh", color:"#111827" }}>
      <style>{`
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 #16a34a40} 50%{box-shadow:0 0 0 6px #16a34a00} }
        button:hover:not(:disabled) { background:#f0fdf4 !important; border-color:#10b981 !important; }
        .tab-btn { border:none; cursor:pointer; background:none; transition:all 0.2s; }
        .tab-btn.active { background:white !important; color:#111827 !important; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
      `}</style>

      {/* Header */}
      <div style={{ background:"#111827", color:"white", padding:"0 24px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex",
          alignItems:"center", justifyContent:"space-between", height:56 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ background:"#10b981", width:28, height:28, borderRadius:8,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🖥</div>
            <span style={{ fontWeight:800, fontSize:16, letterSpacing:-0.5 }}>PisoNet</span>
            <span style={{ fontSize:12, color:"#6b7280", marginLeft:4 }}>Admin Dashboard</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:7,height:7,borderRadius:"50%",
              background:pollStatus==="live"?"#10b981":"#f59e0b",
              animation:pollStatus==="live"?"pulse 2s infinite":"none" }}/>
            <span style={{ fontSize:11, color:"#9ca3af" }}>
              {pollStatus==="live"?"Live — polling every 3s":"Syncing…"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:"#111827", padding:"0 24px 12px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", gap:4,
          background:"#1f2937", borderRadius:10, padding:4, width:"fit-content" }}>
          {tabs.map(t => (
            <button key={t} className={`tab-btn ${activeTab===t?"active":""}`}
              onClick={() => setActiveTab(t)}
              style={{ padding:"6px 18px", borderRadius:7, fontSize:13, fontWeight:600,
                color:activeTab===t?"#111827":"#9ca3af", textTransform:"capitalize" }}>
              {t}
              {t==="alerts" && alerts.length > 0 &&
                <span style={{ marginLeft:6, background:"#ef4444", color:"white",
                  borderRadius:10, padding:"1px 6px", fontSize:10 }}>{alerts.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"20px 24px" }}>

        {/* Summary row */}
        <div style={{ display:"flex", gap:12, marginBottom:20 }}>
          {[
            { label:"Active",  value:activeMachines,  color:"#10b981", bg:"#f0fdf4" },
            { label:"Idle",    value:idleMachines,    color:"#6b7280", bg:"#f9fafb" },
            { label:"Offline", value:offlineMachines, color:"#ef4444", bg:"#fef2f2" },
            { label:"Total",   value:machines.length, color:"#3b82f6", bg:"#eff6ff" },
          ].map(s => (
            <div key={s.label} style={{ flex:1, background:s.bg, borderRadius:10,
              padding:"12px 16px", border:`1px solid ${s.color}20` }}>
              <div style={{ fontSize:11, color:"#6b7280", marginBottom:2 }}>{s.label} PCs</div>
              <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── MACHINES TAB ── */}
        {activeTab === "machines" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
              {machines.map(m => (
                <MachineCard key={m.id} machine={m} onCommand={handleCommand}/>
              ))}
            </div>
          </>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === "analytics" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <IncomeCard data={MOCK_INCOME}/>
            <div style={{ background:"white", borderRadius:12, padding:20,
              border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"#374151" }}>
                Weekly Income (₱)
              </div>
              <SimpleBarChart data={weeklyData}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ background:"white", borderRadius:12, padding:20,
                border:"1px solid #e5e7eb" }}>
                <div style={{ fontWeight:700, fontSize:13, color:"#374151", marginBottom:12 }}>Peak Hours</div>
                {[{h:"2PM–4PM",pct:90},{h:"7PM–9PM",pct:85},{h:"12PM–2PM",pct:70}].map(r=>(
                  <div key={r.h} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#6b7280", marginBottom:3 }}>
                      <span>{r.h}</span><span>{r.pct}%</span>
                    </div>
                    <div style={{ height:6, background:"#f3f4f6", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:`${r.pct}%`, height:"100%", background:"#10b981", borderRadius:3 }}/>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:"white", borderRadius:12, padding:20, border:"1px solid #e5e7eb" }}>
                <div style={{ fontWeight:700, fontSize:13, color:"#374151", marginBottom:12 }}>Session Stats</div>
                {[
                  {label:"Avg session length", value:"42 min"},
                  {label:"Sessions today", value:"34"},
                  {label:"Revenue/session", value:"₱18"},
                  {label:"Utilization rate", value:"67%"},
                ].map(s=>(
                  <div key={s.label} style={{ display:"flex", justifyContent:"space-between",
                    padding:"6px 0", borderBottom:"1px solid #f3f4f6", fontSize:13 }}>
                    <span style={{ color:"#6b7280" }}>{s.label}</span>
                    <span style={{ fontWeight:700, color:"#111827" }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ALERTS TAB ── */}
        {activeTab === "alerts" && (
          <div style={{ background:"white", borderRadius:12, padding:20,
            border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"#374151" }}>
              Active Alerts
            </div>
            {alerts.length === 0
              ? <div style={{ color:"#9ca3af", fontSize:13, padding:"20px 0", textAlign:"center" }}>No alerts 🎉</div>
              : alerts.map(a => <AlertItem key={a.id} alert={a}/>)
            }
          </div>
        )}

        {/* ── LOGS TAB ── */}
        {activeTab === "logs" && (
          <div style={{ background:"white", borderRadius:12, padding:20,
            border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"#374151" }}>Audit Logs</div>
            <div style={{ fontFamily:"monospace", fontSize:12, color:"#374151", lineHeight:2 }}>
              {[
                "[2025-04-23 14:22:01] admin → shutdown PC-04",
                "[2025-04-23 14:20:55] PC-02 session started (session_id: 102)",
                "[2025-04-23 14:18:30] PC-04 went offline",
                "[2025-04-23 14:15:00] admin login from 192.168.1.5",
                "[2025-04-23 14:10:12] PC-01 session started (session_id: 101)",
              ].map((l,i) => (
                <div key={i} style={{ padding:"4px 8px", borderRadius:4,
                  background: i%2===0?"#f9fafb":"transparent" }}>{l}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24,
          background:"#111827", color:"white", padding:"10px 18px",
          borderRadius:10, fontSize:13, fontWeight:600,
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)", zIndex:999,
          animation:"slideIn 0.2s ease" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/*
──────────────────────────────────────────────────────────────────
NEXT STEPS — replace mock data with real API calls:

1. Install Axios:
   npm install axios

2. Create /src/api.js:
   import axios from 'axios';
   export const BASE = 'http://localhost/pisonet/api';
   export const getMachines = () => axios.get(`${BASE}/heartbeat.php`);
   export const sendCommand  = (id, cmd) => axios.post(`${BASE}/command.php`, { machine_id:id, command:cmd });

3. Replace the useEffect polling with:
   const fetchMachines = async () => {
     const { data } = await getMachines();
     setMachines(data);
   };
   useEffect(() => {
     fetchMachines();
     const interval = setInterval(fetchMachines, 3000);
     return () => clearInterval(interval);
   }, []);

4. PHP file structure:
   /htdocs/pisonet/
   ├── api/
   │   ├── login.php
   │   ├── heartbeat.php   ← machines ping this
   │   ├── metrics.php
   │   ├── session.php
   │   ├── command.php     ← dashboard posts commands here
   │   ├── get_command.php ← Python client polls this
   │   └── alerts.php
   └── db/
       └── config.php

5. Python client (client.py → build with PyInstaller):
   pyinstaller --onefile --noconsole client.py
──────────────────────────────────────────────────────────────────
*/
