import { useState, useEffect, useRef } from "react";
import { getMachines, getAlerts, getLogs, getAnalytics, sendCommand, resolveAlert,
  getProcesses, killProcess, requestScreenshot, getScreenshot, getEventLogs, getHealth, wakeMachine,
  updateMachineRate, getArchivedMachines, restoreMachine, restartApp } from "./api";
import ReportGenerator from "./ReportGenerator";
import MachineDetailsModal from "./MachineDetailsModal";
import { confirmAction, confirmDanger, showSuccess } from "./confirmDialog";
import "./Dashboard.css";

function parseUTC(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes("Z") || dateStr.includes("+")) return new Date(dateStr);
  // Replace space with T and add Z → "2026-06-04T10:06:19Z"
  return new Date(dateStr.replace(" ", "T") + "Z");
}

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
  const diff = Math.floor((Date.now() - parseUTC(dateStr)) / 1000);
  if (diff < 0)    return "just now";
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// -- Hook: auto-updating relative time --
// Returns a time string that updates every 30 seconds automatically
function useRelativeTime(dateStr) {
  const [label, setLabel] = useState(() => fmtRelative(dateStr));
  useEffect(() => {
    setLabel(fmtRelative(dateStr));
    const interval = setInterval(() => {
      setLabel(fmtRelative(dateStr));
    }, 30000);
    return () => clearInterval(interval);
  }, [dateStr]);
  return label;
}

// -- Hook: returns current time, updates every 30 seconds --
// Used to force relative timestamps to refresh in child components
function useLiveClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

// -- Helper: format a datetime string nicely --
function fmtDateTime(dateStr) {
  if (!dateStr) return "";
  const d = parseUTC(dateStr);
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

// -- Machine card with live countdown timer --
function MachineCard({ machine, onCommand, sending, onShowDetails }) {
  const isOffline = machine.status === "offline";
  const serverRemaining = machine.session?.remaining_sec ?? 0;
  useLiveClock(); // forces re-render every 30s so relative times update

  const [editingRate, setEditingRate] = useState(false);
  const [rateValue,   setRateValue]   = useState(machine.pesos_per_minute);
  

  // Local countdown that ticks every second between server polls
  const [localRemaining, setLocalRemaining] = useState(serverRemaining);

  // Sync with server value whenever it updates
  useEffect(() => {
    setLocalRemaining(serverRemaining);
  }, [serverRemaining]);

  // Count down every second locally
  useEffect(() => {
    if (!machine.session || machine.status !== "online") return;
    const interval = setInterval(() => {
      setLocalRemaining(prev => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [machine.session?.id, machine.status]);

  const remaining   = localRemaining;
  const isLow       = remaining > 0 && remaining < 300;
  const borderColor = { online: "#6ee7b7", idle: "#d1d5db", offline: "#fca5a5" }[machine.status] || "#d1d5db";
  const timerBg     = machine.status === "online" ? (isLow ? "#fef2f2" : "#f0fdf4") : "#f9fafb";
  const timerColor  = machine.status === "online" ? (isLow ? "#ef4444" : "#10b981") : "#d1d5db";
  const timerBorder = isLow ? "1px solid #fecaca" : "1px solid transparent";

  // Auto-updating relative times
  const lastSeenLabel    = useRelativeTime(machine.last_seen);
  const sessionStartLabel = useRelativeTime(machine.session?.started_at);

  const handleRateSave = async () => {
    try {
      await updateMachineRate(machine.name, parseFloat(rateValue));
      setEditingRate(false);
    } catch {
      alert("Failed to update rate");
    }
  };

  return (
    <div className="machine-card" style={{ border: `1.5px solid ${borderColor}`, opacity: isOffline ? 0.75 : 1 }}>
      <div className="machine-header">
        <div className="machine-name-row">
          <div className="machine-icon" style={{ background: isOffline ? "#f3f4f6" : "#f0fdf4" }}>🖥</div>
          <div>
            <div className="machine-name">{machine.name}</div>
            {machine.os && <div className="machine-os">{machine.os}</div>}
            {editingRate ? (
              <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, marginTop: 2 }}>
                <input
                  type="number"
                  step="0.5"
                  value={rateValue}
                  onChange={e => setRateValue(e.target.value)}
                  style={{ width: 50, fontSize: 11, padding: "2px 4px" }}
                />
                <span>min/₱</span>
                <button onClick={handleRateSave} style={{ fontSize: 10 }}>✓</button>
                <button onClick={() => setEditingRate(false)} style={{ fontSize: 10 }}>✗</button>
              </div>
            ) : (
              <div
                style={{ fontSize: 10, color: "#9ca3af", cursor: "pointer", marginTop: 2 }}
                onClick={() => setEditingRate(true)}
                title="Click to edit rate"
              >
                ₱1 = {machine.pesos_per_minute} min ✎
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={onShowDetails}
            title="View machine details"
            style={{
              background: "none", border: "1px solid #e5e7eb", borderRadius: 6,
              width: 22, height: 22, fontSize: 11, color: "#6b7280",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ℹ
          </button>
          <StatusBadge status={machine.status} />
        </div>
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
          <div className="metric-label-row" style={{ marginTop: 2 }}>
      <span>DISK</span>
      {machine.disk >= 90 && <span className="metric-warn">⚠ High</span>}
    </div>
    <MiniBar value={machine.disk} warn={75} danger={90} />
        </div>
      )}


      {isOffline ? (
        // Machine is offline — show only Wake button
        <div className="cmd-row">
          <button
            className="cmd-btn"
            disabled={sending === machine.name}
            onClick={() => onCommand(machine.name, 'wake')}
            title="Wake On LAN"
            style={{ background: "#eff6ff", borderColor: "#93c5fd", color: "#1d4ed8" }}
          >
            <span>⚡</span>
            <span style={{ fontSize: 10 }}>Wake PC</span>
          </button>
        </div>
      ) : null}

      <div className="timer-box" style={{ background: timerBg, border: timerBorder }}>
        <div className="timer-label">TIME REMAINING</div>
        <div className="timer-display" style={{ color: timerColor }}>
          {machine.status === "online" ? fmtTime(remaining) : "--:--"}
        </div>
        {machine.session && (
          <div className="timer-info">
            ₱{machine.session.pesos} · started {sessionStartLabel}
          </div>
        )}
      </div>

      {!isOffline && (
        // Machine is online/idle — show normal command buttons
        <div className="cmd-row">
          {[
            { cmd: "shutdown", label: "Shutdown", emoji: "⏻" },
            { cmd: "restart",  label: "Restart",  emoji: "↺" },
            { cmd: "lock",     label: "Lock",     emoji: "🔒" },
          ].map(({ cmd, label, emoji }) => (
            <button
              key={cmd}
              className="cmd-btn"
              disabled={sending === machine.name}
              onClick={async () => {
      const result = await confirmAction({
        title: `${label} ${machine.name}?`,
        text: machine.session
          ? `This PC has an active session (₱${machine.session.pesos}). The customer's session will be interrupted.`
          : `Are you sure you want to ${label.toLowerCase()} this machine?`,
        confirmText: `Yes, ${label.toLowerCase()}`,
      });
      if (result.isConfirmed) {
        onCommand(machine.name, cmd);
      }
    }}
              title={label}
            >
              <span>{emoji}</span>
              <span style={{ fontSize: 10 }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {machine.last_seen && (
        <div className="machine-last-seen">Last seen {lastSeenLabel}</div>
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
  const icons    = { offline: "⚫", cpu: "🔴", ram: "🟠", idle: "🟡" };
  const timeLabel = useRelativeTime(alert.created_at);
  return (
    <div className="alert-row">
      <span className="alert-icon">{icons[alert.type] ?? "⚪"}</span>
      <div style={{ flex: 1 }}>
        <div className="alert-message">{alert.message}</div>
        <div className="alert-time">{timeLabel}</div>
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
  const [detailsMachine, setDetailsMachine] = useState(null);
  const [sendingCmd,  setSendingCmd]  = useState(null);
  const [error,       setError]       = useState(null);
  const [showMenu,    setShowMenu]    = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter,   setLogFilter]   = useState("");
  const [logLimit,    setLogLimit]    = useState(50);
  const [archivedMachines, setArchivedMachines] = useState([]);
  const greetedRef = useRef(false);

  // Troubleshooting state
  const [selectedMachine,  setSelectedMachine]  = useState("");
  const [processes,        setProcesses]         = useState([]);
  const [processTime,      setProcessTime]       = useState(null);
  const [processLoading,   setProcessLoading]    = useState(false);
  const [screenshot,       setScreenshot]        = useState(null);
  const [screenshotTime,   setScreenshotTime]    = useState(null);
  const [screenshotLoading,setScreenshotLoading] = useState(false);
  const [autoRefresh,      setAutoRefresh]       = useState(false);
  const autoRefreshRef = useRef(null);
  const [eventLogs,        setEventLogs]         = useState([]);
  const [eventLogTime,     setEventLogTime]      = useState(null);
  const [eventLogLoading,  setEventLogLoading]   = useState(false);


  // Health state
  const [healthData,    setHealthData]    = useState([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [syncResult,    setSyncResult]    = useState(null);

  // Fetch machines every 3 seconds
  useEffect(() => {
    const fetchMachines = async () => {
      try {
        setPollStatus("syncing");
        const res = await getMachines();
        if (res.data.success) {
          setMachines(res.data.data.machines);
          setError(null);

          if (!greetedRef.current) {
  const m = res.data.data.machines;
  const onlineCount  = m.filter(x => x.status === "online").length;
  const offlineCount = m.filter(x => x.status === "offline").length;
  const total        = m.length;

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  showSuccess(
    `${onlineCount}/${total} PCs online${offlineCount > 0 ? `, ${offlineCount} offline` : ''}.`,
    `${timeGreeting}, ${session?.username}!`,
    3000
  );
  greetedRef.current = true;
}
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

  // Fetch health when that tab is opened
  useEffect(() => {
    if (activeTab === "health") fetchHealth();
  }, [activeTab]);

  useEffect(() => {
  if (activeTab === "archived") fetchArchivedMachines();
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

  const fetchArchivedMachines = async () => {
  try {
    const res = await getArchivedMachines();
    if (res.data.success) setArchivedMachines(res.data.data.machines);
  } catch {}
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

  const handleRestore = async (machineName) => {
  try {
    await restoreMachine(machineName);
    showToast(`✓ ${machineName} restored`);
    fetchArchivedMachines();
  } catch {
    showToast("✗ Failed to restore machine");
  }
};

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // -- Troubleshooting fetch functions --
  const fetchProcesses = async (machine) => {
    if (!machine) return;
    setProcessLoading(true);
    try {
      const res = await getProcesses(machine);
      if (res.data.success) {
        setProcesses(res.data.data.processes);
        setProcessTime(res.data.data.recorded_at);
      }
    } catch { console.error("Failed to fetch processes"); }
    finally { setProcessLoading(false); }
  };

  const fetchScreenshot = async (machine) => {
    if (!machine) return;
    setScreenshotLoading(true);
    try {
      const res = await getScreenshot(machine);
      if (res.data.success) {
        setScreenshot(res.data.data.image);
        setScreenshotTime(res.data.data.recorded_at);
      }
    } catch { console.error("Failed to fetch screenshot"); }
    finally { setScreenshotLoading(false); }
  };

  const fetchEventLogs = async (machine) => {
    if (!machine) return;
    setEventLogLoading(true);
    try {
      const res = await getEventLogs(machine);
      if (res.data.success) {
        setEventLogs(res.data.data.logs);
        setEventLogTime(res.data.data.recorded_at);
      }
    } catch { console.error("Failed to fetch event logs"); }
    finally { setEventLogLoading(false); }
  };

  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await getHealth();
      if (res.data.success) setHealthData(res.data.data.health);
    } catch { console.error("Failed to fetch health data"); }
    finally { setHealthLoading(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      // Calls sync.php on local server
      const res = await fetch('http://localhost/pisonetV2/sync.php?key=pisonet123');
      const data = await res.json();
      if (data.success) {
        setSyncResult({ ok: true, message: data.message, time: data.synced_at });
        showToast("✓ Cloud sync complete");
      } else {
        setSyncResult({ ok: false, message: data.message });
        showToast("✗ Sync failed");
      }
    } catch (err) {
      setSyncResult({ ok: false, message: "Cannot reach local sync endpoint" });
      showToast("✗ Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectMachine = (name) => {
    setSelectedMachine(name);
    setProcesses([]);
    setScreenshot(null);
    setEventLogs([]);
    fetchProcesses(name);
    fetchScreenshot(name);
    fetchEventLogs(name);
  };

  const handleRequestScreenshot = async (machine) => {
  const target = machine || selectedMachine;
  if (!target) return;
  setScreenshotLoading(true);

  const previousTime = screenshotTime; // remember what we had before

  try {
    await requestScreenshot(target);

    // poll a few times until a NEW screenshot appears, instead of one fixed wait
    let attempts = 0;
    const maxAttempts = 6; // 6 tries × 1.5s = up to 9 seconds total

    const poll = async () => {
      attempts++;
      const res = await getScreenshot(target);
      if (res.data.success && res.data.data.recorded_at !== previousTime) {
        // got a genuinely new screenshot
        setScreenshot(res.data.data.image);
        setScreenshotTime(res.data.data.recorded_at);
        setScreenshotLoading(false);
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(poll, 1500);
      } else {
        setScreenshotLoading(false); // give up gracefully after max attempts
      }
    };

    setTimeout(poll, 1500); // first check after 1.5s, then retry every 1.5s
  } catch {
    showToast("Failed to request screenshot");
    setScreenshotLoading(false);
  }
};

  const toggleAutoRefresh = (machine) => {
  if (autoRefresh) {
    clearInterval(autoRefreshRef.current);
    setAutoRefresh(false);
  } else {
    setAutoRefresh(true);
    let elapsed = 0;
    const maxDuration = 2 * 60 * 1000; // auto-stop after 2 minutes

    autoRefreshRef.current = setInterval(() => {
      elapsed += 3000;
      if (elapsed >= maxDuration) {
        clearInterval(autoRefreshRef.current);
        setAutoRefresh(false);
        showToast("Auto-refresh stopped after 2 minutes");
        return;
      }
      handleRequestScreenshot(machine);
    }, 3000);
  }
};

  // Clean up auto refresh interval when machine changes or tab changes
  useEffect(() => {
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
      setAutoRefresh(false);
    };
  }, [selectedMachine, activeTab]);

  const handleKillProcess = async (proc) => {
  const result = await confirmDanger({
    title: `Kill "${proc.name}"?`,
    text: `PID: ${proc.pid} — this will force-close the process immediately. Unsaved work in this program will be lost.`,
    confirmText: 'Yes, kill process',
  });

  if (!result.isConfirmed) return;

  try {
    await killProcess(selectedMachine, proc.pid, proc.name);
    showToast(`Kill command sent for ${proc.name} (PID: ${proc.pid})`);
    setTimeout(() => fetchProcesses(selectedMachine), 3000);
  } catch {
    showToast("Failed to send kill command");
  }
};

const handleRestartApp = async (proc) => {
  const result = await confirmAction({
    title: `Restart "${proc.name}"?`,
    text: `This will close and relaunch the application. Any unsaved progress in it will be lost.`,
    confirmText: 'Yes, restart it',
    icon: 'question',
  });

  if (!result.isConfirmed) return;

  try {
    await restartApp(selectedMachine, proc.exe);
    showToast(`Restart requested for ${proc.name}`);
    setTimeout(() => fetchProcesses(selectedMachine), 5000); // give it time to relaunch
  } catch {
    showToast("Failed to send restart command");
  }
};

  const counts = {
    online:  machines.filter(m => m.status === "online").length,
    idle:    machines.filter(m => m.status === "idle").length,
    offline: machines.filter(m => m.status === "offline").length,
    total:   machines.length,
  };
  

  const tabs = ["machines", "analytics", "alerts", "logs", "troubleshoot", "health", "archived"];

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
            {/* Sync to cloud button */}
            

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
                    {/* Admins see "Settings", staff see "My Account" */}
                    <button
                      className="logout-btn"
                      style={{ color: "#374151" }}
                      onClick={() => { setShowMenu(false); onSettings(); }}
                    >
                      {session?.role === "admin" ? "⚙ Settings" : "👤 My Account"}
                    </button>
                    <button
  className="logout-btn"
  onClick={async () => {
    setShowMenu(false);
    const result = await confirmAction({
      title: 'Sign out?',
      text: 'You will need to log in again to access the dashboard.',
      confirmText: 'Yes, sign out',
      icon: 'question',
    });
    if (result.isConfirmed) onLogout();
  }}
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
          <button
  className="troubleshoot-action-btn"
  onClick={async () => {
    const offlineMachines = machines.filter(m => m.status === 'offline').map(m => m.name);
    if (offlineMachines.length === 0) {
      showToast('No offline machines to wake');
      return;
    }
    await wakeAllMachines(offlineMachines);
    showToast(`Wake command sent to ${offlineMachines.length} machine(s)`);
  }}
  style={{ marginBottom: 16 }}
>
  ⚡ Wake All Offline PCs
</button>
            {machines.length === 0 && !error && (
              <div className="empty-state">
                {pollStatus === "connecting" ? "Connecting to server…" : "No machines registered yet. Run client.exe on each PC."}
              </div>
            )}
          <div className="machines-grid">
  {machines.map(m => (
    <MachineCard
      key={m.name}
      machine={m}
      onCommand={handleCommand}
      sending={sendingCmd}
      onShowDetails={() => setDetailsMachine(m)}
    />
  ))}
</div>
          </>
        )}

        {/* Analytics tab */}
        {activeTab === "analytics" && (
          <div className="analytics-section">
            {/* PDF Report Generator */}
            <ReportGenerator />

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
                {/* Peak Hours */}
                {analytics.peak_hours && analytics.peak_hours.length > 0 && (
                  <div className="stats-card" style={{ gridColumn: "1 / -1" }}>
                    <div className="stats-title">Peak Hours Today</div>
                    {analytics.peak_hours.map((row, i) => {
                      const max = analytics.peak_hours[0].sessions;
                      const pct = max > 0 ? (row.sessions / max) * 100 : 0;
                      return (
                        <div key={row.hour} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                            <span style={{ fontWeight: 600, color: "#111827", width: 60 }}>{row.hour_label}</span>
                            <span style={{ color: "#6b7280" }}>{row.sessions} session{row.sessions !== 1 ? "s" : ""}</span>
                            <span style={{ fontWeight: 700, color: "#10b981" }}>₱{(+row.income).toLocaleString()}</span>
                          </div>
                          {/* activity bar */}
                          <div style={{ background: "#e5e7eb", borderRadius: 3, height: 6 }}>
                            <div style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: i === 0 ? "#10b981" : "#6ee7b7",
                              borderRadius: 3,
                              transition: "width 0.6s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })}
                    {analytics.peak_hours.length === 0 && (
                      <div className="no-data-small">No sessions recorded today</div>
                    )}
                  </div>
                )}
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

      {/* Troubleshooting tab */}
        {activeTab === "troubleshoot" && (
          <div className="troubleshoot-layout">

            {/* Machine selector */}
            <div className="troubleshoot-selector">
              <select
                className="troubleshoot-select"
                value={selectedMachine}
                onChange={e => handleSelectMachine(e.target.value)}
              >
                <option value="">— Select a machine —</option>
                {machines
                  .filter(m => m.status === "online")
                  .map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
              </select>

              {selectedMachine && (
                <button
                  className="troubleshoot-action-btn"
                  onClick={() => { fetchProcesses(selectedMachine); fetchEventLogs(selectedMachine); }}
                >
                  ↺ Refresh All
                </button>
              )}
            </div>

            {!selectedMachine ? (
              <div className="troubleshoot-empty">
                Select an online machine above to view troubleshooting data
              </div>
            ) : (
              <>
                {/* Process List */}
                <div className="troubleshoot-card">
                  <div className="troubleshoot-card-header">
                    <span className="troubleshoot-card-title">
                      🔧 Running Processes — {selectedMachine}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {processTime && (
                        <span className="troubleshoot-card-meta">
                          Updated {fmtRelative(processTime)}
                        </span>
                      )}
                      <button
                        className="troubleshoot-action-btn"
                        onClick={() => fetchProcesses(selectedMachine)}
                        disabled={processLoading}
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        {processLoading ? "Loading…" : "↺ Refresh"}
                      </button>
                    </div>
                  </div>

                  {processLoading ? (
                    <div className="troubleshoot-loading">Loading processes…</div>
                  ) : processes.length === 0 ? (
                    <div className="troubleshoot-empty">No process data yet — wait a few seconds</div>
                  ) : (
                    <div style={{ maxHeight: 400, overflowY: "auto" }}>
                      <table className="process-table">
                        <thead>
                          <tr>
                            <th>Process Name</th>
                            <th>PID</th>
                            <th>CPU %</th>
                            <th>RAM %</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {processes.map(proc => (
                            <tr key={proc.pid}>
                              <td className="process-name" title={proc.name}>{proc.name}</td>
                              <td className="process-pid">{proc.pid}</td>
                              <td className={
                                proc.cpu >= 50 ? "process-cpu-high" :
                                proc.cpu >= 20 ? "process-cpu-med"  : "process-cpu-low"
                              }>
                                {proc.cpu.toFixed(1)}%
                              </td>
                              <td className="process-cpu-low">{proc.ram.toFixed(1)}%</td>
                              <td>
  <div style={{ display: "flex", gap: 4 }}>
    <button
      className="troubleshoot-action-btn danger"
      style={{ padding: "3px 10px", fontSize: 11 }}
      onClick={() => handleKillProcess(proc)}
    >
      Kill
    </button>
    {proc.exe && (
      <button
        className="troubleshoot-action-btn"
        style={{ padding: "3px 10px", fontSize: 11 }}
        onClick={() => handleRestartApp(proc)}
      >
        ↺ Restart
      </button>
    )}
  </div>
</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {processes.length > 0 && (() => {
  const topProcess = processes[0]; // already sorted by CPU descending
  const machine = machines.find(m => m.name === selectedMachine);
  
  if (!machine || (machine.cpu < 70 && machine.ram < 75)) return null;

  return (
    <div style={{
      background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10,
      padding: "12px 16px", marginBottom: 12, fontSize: 13,
    }}>
      <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
        💡 Suggested Diagnosis
      </div>
      <div style={{ color: "#78350f" }}>
        {machine.cpu >= 70 && (
          <div>
            High CPU ({machine.cpu.toFixed(0)}%) is likely caused by <strong>{topProcess.name}</strong> (using {topProcess.cpu.toFixed(1)}% CPU).
            {' '}Consider restarting this application or closing it if unresponsive.
          </div>
        )}
      </div>
    </div>
  );
})()}

                {/* Screenshot */}
                <div className="troubleshoot-card">
                  <div className="troubleshoot-card-header">
                    <span className="troubleshoot-card-title">
                      📷 Remote Screenshot — {selectedMachine}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {screenshotTime && (
                        <span className="troubleshoot-card-meta">
                          Taken {fmtRelative(screenshotTime)}
                        </span>
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="troubleshoot-action-btn"
                          onClick={() => handleRequestScreenshot()}
                          disabled={screenshotLoading}
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          {screenshotLoading ? "Requesting…" : "📷 Capture"}
                        </button>
                        <button
                          className={`troubleshoot-action-btn ${autoRefresh ? "danger" : ""}`}
                          onClick={() => toggleAutoRefresh(selectedMachine)}
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          {autoRefresh ? "⏹ Stop Auto" : "▶ Auto (3s)"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="screenshot-container">
                    {screenshotLoading ? (
                      <div className="troubleshoot-loading">Requesting screenshot…</div>
                    ) : screenshot ? (
                      <img
                        src={screenshot}
                        alt={`Screenshot of ${selectedMachine}`}
                        className="screenshot-img"
                      />
                    ) : (
                      <div className="screenshot-placeholder">
                        No screenshot yet — click "Take Screenshot" above
                      </div>
                    )}
                  </div>
                </div>

                {/* Windows Event Logs */}
                <div className="troubleshoot-card">
                  <div className="troubleshoot-card-header">
                    <span className="troubleshoot-card-title">
                      📋 Windows Event Logs — {selectedMachine}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {eventLogTime && (
                        <span className="troubleshoot-card-meta">
                          Updated {fmtRelative(eventLogTime)}
                        </span>
                      )}
                      <button
                        className="troubleshoot-action-btn"
                        onClick={() => fetchEventLogs(selectedMachine)}
                        disabled={eventLogLoading}
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        {eventLogLoading ? "Loading…" : "↺ Refresh"}
                      </button>
                    </div>
                  </div>

                  {eventLogLoading ? (
                    <div className="troubleshoot-loading">Loading event logs…</div>
                  ) : eventLogs.length === 0 ? (
                    <div className="troubleshoot-empty">
                      No event logs yet — logs are sent every 60 seconds.<br/>
                      <span style={{ fontSize: 11, color: "#c4c9d4" }}>
                        Requires pywin32 installed on the client PC.
                      </span>
                    </div>
                  ) : (
                    <div className="eventlog-list">
                      {eventLogs.map((log, i) => (
                        <div key={i} className="eventlog-row">
                          <span className={`eventlog-level ${log.level.toLowerCase()}`}>
                            {log.level}
                          </span>
                          <span className="eventlog-source">{log.source}</span>
                          <span className="eventlog-message">{log.message}</span>
                          <span className="eventlog-time">
                            {fmtRelative(log.time)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}


        {/* Health tab */}
        {activeTab === "health" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>

            {/* Header */}
            <div className="health-header-row">
              <div>
                <div className="health-header-title">Hardware Health Monitor</div>
                <div className="health-header-sub">
                  Based on 7-day average metrics — helps identify PCs that need maintenance or hardware upgrades
                </div>
              </div>
              <button
                className="troubleshoot-action-btn"
                onClick={fetchHealth}
                disabled={healthLoading}
              >
                {healthLoading ? "Analyzing…" : "↺ Refresh"}
              </button>
            </div>

            {/* Summary */}
            {healthData.length > 0 && (
              <div className="health-summary-row">
                {[
                  { label: "Healthy",        color: "#10b981", status: "healthy"   },
                  { label: "Needs Attention", color: "#f59e0b", status: "attention" },
                  { label: "Critical",        color: "#ef4444", status: "critical"  },
                ].map(s => (
                  <div key={s.label} className="health-summary-card">
                    <div className="health-summary-count" style={{ color: s.color }}>
                      {healthData.filter(h => h.status === s.status).length}
                    </div>
                    <div className="health-summary-label">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {healthLoading ? (
              <div className="troubleshoot-loading">Analyzing hardware health…</div>
            ) : healthData.length === 0 ? (
              <div className="troubleshoot-empty">
                No health data yet — machines need at least a few hours of metric history
              </div>
            ) : (
              <div className="health-grid">
                {healthData.map(h => (
                  <div key={h.machine_name} className={`health-card ${h.status}`}>

                    {/* Header */}
                    <div className="health-card-header">
                      <div>
                        <div className="health-machine-name">
                          🖥 {h.machine_name}
                        </div>
                        <span className={`health-status-badge ${h.status}`} style={{ marginTop: 4, display: "inline-block" }}>
                          {h.status_label}
                        </span>
                      </div>
                      <div className={`health-score-circle ${h.status}`}>
                        <span>{h.score}</span>
                        <span className="health-score-label">/ 100</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="health-stats">
                      {[
                        { label: "Avg CPU",   value: `${h.avg_cpu}%`,      warn: h.avg_cpu >= 60,  danger: h.avg_cpu >= 80  },
                        { label: "Avg RAM",   value: `${h.avg_ram}%`,      warn: h.avg_ram >= 70,  danger: h.avg_ram >= 85  },
                        { label: "Avg Disk",  value: `${h.avg_disk}%`,     warn: h.avg_disk >= 75, danger: h.avg_disk >= 90 },
                        { label: "Uptime",    value: `${h.uptime_days}d`,  warn: h.uptime_days >= 7, danger: h.uptime_days >= 14 },
                        { label: "Downtime",  value: `${h.offline_count}x`, warn: h.offline_count >= 2, danger: h.offline_count >= 5 },
                      ].map(s => (
                        <div key={s.label} className="health-stat">
                          <div className="health-stat-label">{s.label}</div>
                          <div className={`health-stat-value ${s.danger ? "danger" : s.warn ? "warn" : "good"}`}>
                            {s.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Recommendations */}
                    <div className="health-recommendations">
                      {h.recommendations.map((rec, i) => {
                        const icons = {
                          critical: "🔴",
                          warning:  "🟡",
                          info:     "🔵",
                          good:     "✅",
                        };
                        return (
                          <div key={i} className="health-rec-item">
                            <span className="health-rec-icon">{icons[rec.level] ?? "⚪"}</span>
                            <div className="health-rec-content">
                              <div className="health-rec-component">{rec.component}</div>
                              <div className="health-rec-message">{rec.message}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "archived" && (
  <div className="alerts-card">
    <div className="alerts-title">Archived Machines</div>
    {archivedMachines.length === 0 ? (
      <div className="no-alerts">No archived machines</div>
    ) : (
      archivedMachines.map(m => (
        <div key={m.name} className="alert-row">
          <span className="alert-icon">🖥</span>
          <div style={{ flex: 1 }}>
            <div className="alert-message">{m.name}</div>
            <div className="alert-time">{m.os || "Unknown OS"} · MAC: {m.mac}</div>
          </div>
          <button className="resolve-btn" onClick={() => handleRestore(m.name)}>
            ↺ Restore
          </button>
        </div>
      ))
    )}
  </div>
)}
{detailsMachine && (
        <MachineDetailsModal
          machine={detailsMachine}
          onClose={() => setDetailsMachine(null)}
          onArchived={() => setDetailsMachine(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
