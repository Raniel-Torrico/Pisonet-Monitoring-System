import { useState, useEffect } from "react";
import { getMachines, getAlerts, getLogs, getAnalytics, sendCommand, resolveAlert } from "./api";
import "./Dashboard.css";

// -- Helper: convert seconds to mm:ss --
function fmtTime(s) {
  if (!s || s <= 0) return "--:--";
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// -- Helper: show how long ago a date was --
function fmtRelative(dateStr) {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// -- Helper: format a datetime string nicely --
function fmtDateTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString('en-PH', {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// -- Status badge --
function StatusBadge({ status }) {
  const config = {
    online:  { bg: "#d1fae5", color: "#065f46", label: "Online"  },
    idle:    { bg: "#f3f4f6", color: "#374151", label: "Idle"    },
    offline: { bg: "#fee2e2", color: "#991b1b", label: "Offline" },
  };
  const s = config[status] || config.idle;
  return (
    <span className="status-badge" style={{ background: s.bg, color: s.color }}>
      <span className={`status-dot ${status}`} />
      {s.label}
    </span>
  );
}

// -- CPU / RAM bar --
function MiniBar({ value, warn, danger }) {
  const color = value >= danger ? "#ef4444" : value >= warn ? "#f59e0b" : "#10b981";
  return (
    <div className="mini-bar-row">
      <div className="mini-bar-track">
        <div className="mini-bar-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="mini-bar-pct">{value.toFixed(0)}%</span>
    </div>
  );
}

// -- Machine card --
function MachineCard({ machine, onCommand, sending }) {
  const isOffline   = machine.status === "offline";
  const remaining   = machine.session?.remaining_sec ?? 0;
  const isLow       = remaining > 0 && remaining < 300;
  const borderColor = { online: "#6ee7b7", idle: "#d1d5db", offline: "#fca5a5" }[machine.status] || "#d1d5db";
  const timerBg     = machine.status === "online" ? (isLow ? "#fef2f2" : "#f0fdf4") : "#f9fafb";
  const timerColor  = machine.status === "online" ? (isLow ? "#ef4444" : "#10b981") : "#d1d5db";
  const timerBorder = isLow ? "1px solid #fecaca" : "1px solid transparent";

  return (
    <div className="machine-card" style={{ border: `1.5px solid ${borderColor}`, opacity: isOffline ? 0.75 : 1 }}>
      <div className="machine-header">
        <div className="machine-name-row">
          <div className="machine-icon" style={{ background: isOffline ? "#f3f4f6" : "#f0fdf4" }}>🖥</div>
          <div>
            <div className="machine-name">{machine.name}</div>
            {machine.os && <div className="machine-os">{machine.os}</div>}
          </div>
        </div>
        <StatusBadge status={machine.status} />
      </div>

      {!isOffline && (
        <div className="metrics-section">
          <div className="metric-label-row">
            <span>CPU</span>
            {machine.cpu >= 85 && <span className="metric-warn">⚠ High</span>}
          </div>
          <MiniBar value={machine.cpu} warn={70} danger={85} />
          <div className="metric-label-row" style={{ marginTop: 2 }}>
            <span>RAM</span>
            {machine.ram >= 90 && <span className="metric-warn">⚠ High</span>}
          </div>
          <MiniBar value={machine.ram} warn={75} danger={90} />
        </div>
      )}

      <div className="timer-box" style={{ background: timerBg, border: timerBorder }}>
        <div className="timer-label">TIME REMAINING</div>
        <div className="timer-display" style={{ color: timerColor }}>
          {machine.status === "online" ? fmtTime(remaining) : "--:--"}
        </div>
        {machine.session && (
          <div className="timer-info">
            ₱{machine.session.pesos} · started {fmtRelative(machine.session.started_at)}
          </div>
        )}
      </div>

      <div className="cmd-row">
        {[
          { cmd: "shutdown", label: "Shutdown", emoji: "⏻" },
          { cmd: "restart",  label: "Restart",  emoji: "↺" },
          { cmd: "lock",     label: "Lock",     emoji: "🔒" },
        ].map(({ cmd, label, emoji }) => (
          <button
            key={cmd}
            className="cmd-btn"
            disabled={isOffline || sending === machine.name}
            onClick={() => onCommand(machine.name, cmd)}
            title={label}
          >
            <span>{emoji}</span>
            <span style={{ fontSize: 10 }}>{label}</span>
          </button>
        ))}
      </div>

      {machine.last_seen && (
        <div className="machine-last-seen">Last seen {fmtRelative(machine.last_seen)}</div>
      )}
    </div>
  );
}

// -- Bar chart --
function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-col">
          <span className="bar-value-label">{d.value > 0 ? `₱${d.value}` : ""}</span>
          <div className="bar-fill" style={{ height: `${Math.max((d.value / max) * 65, 4)}px` }} />
          <span className="bar-day-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// -- Alert row --
function AlertRow({ alert, onResolve }) {
  const icons = { offline: "⚫", cpu: "🔴", ram: "🟠", idle: "🟡" };
  return (
    <div className="alert-row">
      <span className="alert-icon">{icons[alert.type] ?? "⚪"}</span>
      <div style={{ flex: 1 }}>
        <div className="alert-message">{alert.message}</div>
        <div className="alert-time">{fmtRelative(alert.created_at)}</div>
      </div>
      <button className="resolve-btn" onClick={() => onResolve(alert.id)}>Resolve</button>
    </div>
  );
}

// -- Log action badge --
function ActionBadge({ action }) {
  const config = {
    login:           { bg: "#eff6ff", color: "#1d4ed8" },
    logout:          { bg: "#f3f4f6", color: "#374151" },
    shutdown:        { bg: "#fef2f2", color: "#991b1b" },
    restart:         { bg: "#fff7ed", color: "#c2410c" },
    lock:            { bg: "#fefce8", color: "#854d0e" },
    unlock:          { bg: "#f0fdf4", color: "#166534" },
    register:        { bg: "#f5f3ff", color: "#6d28d9" },
    offline:         { bg: "#fef2f2", color: "#991b1b" },
    add_account:     { bg: "#f0fdf4", color: "#166534" },
    delete_account:  { bg: "#fef2f2", color: "#991b1b" },
    change_password: { bg: "#fefce8", color: "#854d0e" },
  };
  const s = config[action] || { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700,
      padding: "2px 8px", borderRadius: 6,
      textTransform: "capitalize",
    }}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

// -- Main dashboard --
export default function PisonetDashboard({ session, onLogout, onSettings }) {
  const [machines,    setMachines]    = useState([]);
  const [alerts,      setAlerts]      = useState([]);
  const [logs,        setLogs]        = useState([]);
  const [analytics,   setAnalytics]   = useState(null);
  const [activeTab,   setActiveTab]   = useState("machines");
  const [pollStatus,  setPollStatus]  = useState("connecting");
  const [toast,       setToast]       = useState(null);
  const [sendingCmd,  setSendingCmd]  = useState(null);
  const [error,       setError]       = useState(null);
  const [showMenu,    setShowMenu]    = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter,   setLogFilter]   = useState("");
  const [logLimit,    setLogLimit]    = useState(50);

  // Fetch machines every 3 seconds
  useEffect(() => {
    const fetchMachines = async () => {
      try {
        setPollStatus("syncing");
        const res = await getMachines();
        if (res.data.success) {
          setMachines(res.data.data.machines);
          setError(null);
        } else {
          setError(res.data.message);
        }
        setPollStatus("live");
      } catch {
        setPollStatus("error");
        setError("Cannot reach server");
      }
    };
    fetchMachines();
    const interval = setInterval(fetchMachines, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch alerts every 5 seconds
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await getAlerts();
        if (res.data.success) setAlerts(res.data.data.alerts);
      } catch {}
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch analytics when that tab is opened
  useEffect(() => {
    if (activeTab === "analytics") fetchAnalytics();
  }, [activeTab]);

  // Fetch logs when that tab is opened
  useEffect(() => {
    if (activeTab === "logs") fetchLogs();
  }, [activeTab]);

  const fetchAnalytics = async () => {
    try {
      const res = await getAnalytics();
      if (res.data.success) setAnalytics(res.data.data);
    } catch {}
  };

  const fetchLogs = async (actor = logFilter, limit = logLimit) => {
    setLogsLoading(true);
    try {
      const params = { limit };
      if (actor.trim()) params.actor = actor.trim();
      const res = await getLogs(params);
      if (res.data.success) setLogs(res.data.data.logs);
    } catch {}
    finally { setLogsLoading(false); }
  };

  const handleCommand = async (machineName, cmd) => {
    setSendingCmd(machineName);
    try {
      const res = await sendCommand(machineName, cmd);
      showToast(res.data.success ? `✓ "${cmd}" sent to ${machineName}` : `✗ ${res.data.message}`);
    } catch {
      showToast("✗ Command failed");
    } finally {
      setSendingCmd(null);
    }
  };

  const handleResolveAlert = async (id) => {
    try {
      const res = await resolveAlert(id);
      if (res.data.success) {
        setAlerts(prev => prev.filter(a => a.id !== id));
        showToast("✓ Alert resolved");
      }
    } catch {}
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const counts = {
    online:  machines.filter(m => m.status === "online").length,
    idle:    machines.filter(m => m.status === "idle").length,
    offline: machines.filter(m => m.status === "offline").length,
    total:   machines.length,
  };

  const tabs = ["machines", "analytics", "alerts", "logs"];

  return (
    <div className="dashboard">

      {/* Header */}
      <div className="header">
        <div className="header-inner">
          <div className="header-logo">
            <div className="header-logo-icon">🖥</div>
            <div>
              <div className="header-logo-name">PisoNet</div>
              <div className="header-logo-sub">ADMIN DASHBOARD</div>
            </div>
          </div>

          <div className="header-right">
            <div className="poll-status">
              <div className={`poll-dot ${pollStatus}`} />
              <span className="poll-label">
                {{ live: "Live", syncing: "Syncing…", error: "Error", connecting: "Connecting…" }[pollStatus]}
              </span>
            </div>

            {/* User dropdown */}
            <div style={{ position: "relative" }}>
              <button className="user-btn" onClick={() => setShowMenu(p => !p)}>
                <div className="user-avatar">{session?.username?.[0]?.toUpperCase() ?? "A"}</div>
                <div>
                  <div className="user-name">{session?.username ?? "Admin"}</div>
                  <div className="user-role">{session?.role ?? "admin"}</div>
                </div>
                <span className="user-caret">▾</span>
              </button>

              {showMenu && (
                <>
                  <div className="overlay" onClick={() => setShowMenu(false)} />
                  <div className="user-dropdown">
                    <button
                      className="logout-btn"
                      style={{ color: "#374151" }}
                      onClick={() => { setShowMenu(false); onSettings(); }}
                    >
                      ⚙ Settings
                    </button>
                    <button
                      className="logout-btn"
                      onClick={() => { setShowMenu(false); onLogout(); }}
                    >
                      🚪 Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-bar">
          <div className="tabs-group">
            {tabs.map(t => (
              <button
                key={t}
                className={`tab-btn ${activeTab === t ? "active" : ""}`}
                onClick={() => setActiveTab(t)}
              >
                {t}
                {t === "alerts" && alerts.length > 0 && (
                  <span className="alert-badge">{alerts.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="content-area">

        {error && <div className="error-banner">⚠ {error}</div>}

        {/* Summary row */}
        <div className="summary-row">
          {[
            { label: "Online",  value: counts.online,  color: "#10b981", bg: "#f0fdf4" },
            { label: "Idle",    value: counts.idle,    color: "#6b7280", bg: "#f9fafb" },
            { label: "Offline", value: counts.offline, color: "#ef4444", bg: "#fef2f2" },
            { label: "Total",   value: counts.total,   color: "#3b82f6", bg: "#eff6ff" },
          ].map(s => (
            <div key={s.label} className="summary-card" style={{ background: s.bg, border: `1px solid ${s.color}25` }}>
              <div className="summary-label">{s.label} PCs</div>
              <div className="summary-value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Machines tab */}
        {activeTab === "machines" && (
          <>
            {machines.length === 0 && !error && (
              <div className="empty-state">
                {pollStatus === "connecting" ? "Connecting to server…" : "No machines registered yet. Run client.exe on each PC."}
              </div>
            )}
            <div className="machines-grid">
              {machines.map(m => (
                <MachineCard key={m.name} machine={m} onCommand={handleCommand} sending={sendingCmd} />
              ))}
            </div>
          </>
        )}

        {/* Analytics tab */}
        {activeTab === "analytics" && (
          <div className="analytics-section">
            {!analytics ? (
              <div className="empty-state">Loading analytics…</div>
            ) : (
              <>
                <div className="income-row">
                  {[
                    { label: "Today",      data: analytics.income.today  },
                    { label: "This Week",  data: analytics.income.week   },
                    { label: "This Month", data: analytics.income.month  },
                  ].map(({ label, data }) => (
                    <div key={label} className="income-card">
                      <div className="income-label">{label}</div>
                      <div className="income-amount">₱{data.total.toLocaleString()}</div>
                      <div className="income-sessions">{data.count} session{data.count !== 1 ? "s" : ""}</div>
                    </div>
                  ))}
                </div>

                <div className="chart-card">
                  <div className="chart-title">Income Last 7 Days (₱)</div>
                  <BarChart data={analytics.chart} />
                </div>

                <div className="stats-grid">
                  <div className="stats-card">
                    <div className="stats-title">Session Stats</div>
                    {[
                      { label: "Online now",         value: `${counts.online} PC${counts.online !== 1 ? "s" : ""}` },
                      { label: "Avg session length", value: `${analytics.stats.avg_duration} min` },
                      { label: "Avg income/session", value: `₱${analytics.stats.avg_income}` },
                      { label: "Sessions today",     value: analytics.income.today.count },
                      { label: "Utilization",        value: counts.total > 0 ? `${Math.round((counts.online / counts.total) * 100)}%` : "—" },
                    ].map(s => (
                      <div key={s.label} className="stats-row">
                        <span className="stats-row-label">{s.label}</span>
                        <span className="stats-row-value">{s.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="stats-card">
                    <div className="stats-title">Top Machines Today</div>
                    {analytics.top_machines.length === 0 ? (
                      <div className="no-data-small">No sessions recorded today</div>
                    ) : (
                      analytics.top_machines.map((m, i) => (
                        <div key={m.machine_name} className="top-machine-row">
                          <span className="top-machine-rank">#{i + 1}</span>
                          <span className="top-machine-name">{m.machine_name}</span>
                          <span className="top-machine-sessions">{m.sessions} sessions</span>
                          <span className="top-machine-income">₱{(+m.income).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Alerts tab */}
        {activeTab === "alerts" && (
          <div className="alerts-card">
            <div className="alerts-title">
              Active Alerts
              {alerts.length > 0 && <span className="alerts-count">{alerts.length} unresolved</span>}
            </div>
            {alerts.length === 0
              ? <div className="no-alerts">🎉 No active alerts</div>
              : alerts.map(a => <AlertRow key={a.id} alert={a} onResolve={handleResolveAlert} />)
            }
          </div>
        )}

        {/* Logs tab */}
        {activeTab === "logs" && (
          <div className="logs-card">
            <div className="logs-header-row">
              <div>
                <div className="logs-title">Audit Logs</div>
                <div className="logs-subtitle">Everything that happens in the system is recorded here</div>
              </div>
              <button className="logs-refresh-btn" onClick={() => fetchLogs(logFilter, logLimit)} disabled={logsLoading}>
                {logsLoading ? "Loading…" : "↺ Refresh"}
              </button>
            </div>

            <div className="logs-filters">
              <div className="logs-filter-group">
                <label className="logs-filter-label">Filter by actor</label>
                <input
                  className="logs-filter-input"
                  type="text"
                  placeholder="e.g. admin or system"
                  value={logFilter}
                  onChange={e => setLogFilter(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchLogs(logFilter, logLimit)}
                />
              </div>
              <div className="logs-filter-group">
                <label className="logs-filter-label">Show last</label>
                <select
                  className="logs-filter-input"
                  value={logLimit}
                  onChange={e => { const v = Number(e.target.value); setLogLimit(v); fetchLogs(logFilter, v); }}
                >
                  <option value={20}>20 entries</option>
                  <option value={50}>50 entries</option>
                  <option value={100}>100 entries</option>
                  <option value={200}>200 entries</option>
                </select>
              </div>
              <button className="logs-search-btn" onClick={() => fetchLogs(logFilter, logLimit)}>Search</button>
            </div>

            {logsLoading ? (
              <div className="logs-loading">Loading logs…</div>
            ) : logs.length === 0 ? (
              <div className="no-alerts">No log entries found</div>
            ) : (
              <div className="logs-table">
                <div className="logs-table-header">
                  <span>Time</span>
                  <span>Actor</span>
                  <span>Action</span>
                  <span>Target</span>
                  <span>Detail</span>
                </div>
                {logs.map((log, i) => (
                  <div key={log.id} className={`logs-table-row ${i % 2 === 0 ? "even" : ""}`}>
                    <span className="log-time">{fmtDateTime(log.created_at)}</span>
                    <span className="log-actor">{log.actor}</span>
                    <span><ActionBadge action={log.action} /></span>
                    <span className="log-target">{log.target || "—"}</span>
                    <span className="log-detail">{log.detail || "—"}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="logs-count">Showing {logs.length} {logs.length === 1 ? "entry" : "entries"}</div>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
