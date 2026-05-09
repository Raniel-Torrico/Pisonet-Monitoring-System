import { useState, useEffect } from "react";
import Login from "./Login";
import PisonetDashboard from "./PisonetDashboard";
import Settings from "./Settings";

// Check if there is a saved login session in localStorage
function getStoredSession() {
  const token    = localStorage.getItem("pisonet_token");
  const username = localStorage.getItem("pisonet_username");
  const role     = localStorage.getItem("pisonet_role");
  const expires  = localStorage.getItem("pisonet_expires");
  const id       = localStorage.getItem("pisonet_id");

  if (!token || !expires) return null;

  // Clear session if token has expired
  if (new Date(expires) < new Date()) {
    localStorage.clear();
    return null;
  }

  return { token, username, role, id: Number(id) };
}

export default function App() {
  const [session,  setSession]  = useState(null);
  const [page,     setPage]     = useState("dashboard"); // "dashboard" or "settings"
  const [checking, setChecking] = useState(true);

  // On page load, check if user is already logged in
  useEffect(() => {
    const stored = getStoredSession();
    if (stored) setSession(stored);
    setChecking(false);
  }, []);

  const handleLogin = (sessionData) => {
    // Save the admin id so we can use it in the settings page
    localStorage.setItem("pisonet_id", sessionData.id ?? "");
    setSession(sessionData);
    setPage("dashboard");
  };

  const handleLogout = () => {
    localStorage.clear();
    setSession(null);
    setPage("dashboard");
  };

  // Show blank screen while checking localStorage
  if (checking) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#64748b",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
      }}>
        Loading…
      </div>
    );
  }

  // Not logged in
  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  // Settings page
  if (page === "settings") {
    return (
      <Settings
        session={session}
        onBack={() => setPage("dashboard")}
      />
    );
  }

  // Main dashboard
  return (
    <PisonetDashboard
      session={session}
      onLogout={handleLogout}
      onSettings={() => setPage("settings")}
    />
  );
}
