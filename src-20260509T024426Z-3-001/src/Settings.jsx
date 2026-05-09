import { useState, useEffect } from "react";
import { getAccounts, addAccount, changePassword, deleteAccount } from "./api";
import "./Settings.css";

// -- Change password form --
function ChangePasswordForm({ session }) {
  const [newPass,    setNewPass]    = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [success,    setSuccess]    = useState("");
  const [error,      setError]      = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (newPass.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPass !== confirmPass) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await changePassword(session.id, newPass, session.username);
      if (res.data.success) {
        setSuccess("Password updated successfully");
        setNewPass("");
        setConfirmPass("");
      } else {
        setError(res.data.message);
      }
    } catch {
      setError("Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <p className="settings-card-title">Change Password</p>
        <p className="settings-card-subtitle">
          Update the password for <strong>{session.username}</strong>
        </p>
      </div>
      <div className="settings-card-body">
        <form className="settings-form" onSubmit={handleSubmit}>

          <div>
            <label className="settings-label">NEW PASSWORD</label>
            <input
              className="settings-input"
              type="password"
              placeholder="At least 6 characters"
              value={newPass}
              onChange={e => { setNewPass(e.target.value); setError(""); setSuccess(""); }}
            />
          </div>

          <div>
            <label className="settings-label">CONFIRM PASSWORD</label>
            <input
              className="settings-input"
              type="password"
              placeholder="Type the same password again"
              value={confirmPass}
              onChange={e => { setConfirmPass(e.target.value); setError(""); setSuccess(""); }}
            />
          </div>

          {error   && <div className="settings-error">⚠ {error}</div>}
          {success && <div className="settings-success">✓ {success}</div>}

          <div>
            <button type="submit" className="settings-btn primary" disabled={loading}>
              {loading ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -- Add account form --
function AddAccountForm({ onAdded }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role,     setRole]     = useState("staff");
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (!username.trim()) { setError("Username is required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }

    setLoading(true);
    try {
      const res = await addAccount(username.trim(), password, role);
      if (res.data.success) {
        setSuccess(`Account "${username}" created`);
        setUsername("");
        setPassword("");
        setRole("staff");
        onAdded(); // refresh the accounts list
      } else {
        setError(res.data.message);
      }
    } catch {
      setError("Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <p className="settings-card-title">Add Account</p>
        <p className="settings-card-subtitle">Create a new admin or staff account</p>
      </div>
      <div className="settings-card-body">
        <form className="settings-form" onSubmit={handleSubmit}>

          <div>
            <label className="settings-label">USERNAME</label>
            <input
              className="settings-input"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); setSuccess(""); }}
            />
          </div>

          <div>
            <label className="settings-label">PASSWORD</label>
            <input
              className="settings-input"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); setSuccess(""); }}
            />
          </div>

          <div>
            <label className="settings-label">ROLE</label>
            <select
              className="settings-select"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="staff">Staff — can view dashboard</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>

          {error   && <div className="settings-error">⚠ {error}</div>}
          {success && <div className="settings-success">✓ {success}</div>}

          <div>
            <button type="submit" className="settings-btn primary" disabled={loading}>
              {loading ? "Creating…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -- Accounts list --
function AccountsList({ session, onRefresh }) {
  const [accounts,      setAccounts]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [changingId,    setChangingId]    = useState(null); // account being edited
  const [deletingId,    setDeletingId]    = useState(null); // account being deleted
  const [newPass,       setNewPass]       = useState("");
  const [passError,     setPassError]     = useState("");
  const [passSuccess,   setPassSuccess]   = useState("");
  const [passLoading,   setPassLoading]   = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await getAccounts();
      if (res.data.success) setAccounts(res.data.data.accounts);
    } catch {
      console.error("Failed to fetch accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  // Called from parent when a new account is added
  useEffect(() => { fetchAccounts(); }, [onRefresh]);

  const handleDelete = async (id, username) => {
    if (!window.confirm(`Are you sure you want to delete "${username}"?`)) return;

    try {
      const res = await deleteAccount(id);
      if (res.data.success) {
        setAccounts(prev => prev.filter(a => a.id !== id));
      } else {
        alert(res.data.message);
      }
    } catch {
      alert("Failed to delete account");
    }
  };

  const handleChangePass = async (e) => {
    e.preventDefault();
    setPassError("");
    setPassSuccess("");

    if (newPass.length < 6) {
      setPassError("Password must be at least 6 characters");
      return;
    }

    setPassLoading(true);
    try {
      const res = await changePassword(changingId, newPass, session.username);
      if (res.data.success) {
        setPassSuccess("Password updated");
        setNewPass("");
        setTimeout(() => {
          setChangingId(null);
          setPassSuccess("");
        }, 1500);
      } else {
        setPassError(res.data.message);
      }
    } catch {
      setPassError("Failed to update password");
    } finally {
      setPassLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-card">
        <div className="settings-card-body" style={{ textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
          Loading accounts…
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <p className="settings-card-title">Manage Accounts</p>
        <p className="settings-card-subtitle">
          {accounts.length} account{accounts.length !== 1 ? "s" : ""} registered
        </p>
      </div>

      <div className="accounts-list">
        {accounts.map(account => (
          <div key={account.id}>
            <div className="account-row">
              {/* Avatar */}
              <div className={`account-avatar ${account.role}`}>
                {account.username[0].toUpperCase()}
              </div>

              {/* Info */}
              <div className="account-info">
                <div className="account-username">
                  {account.username}
                  {account.username === session.username && (
                    <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>(you)</span>
                  )}
                </div>
                <div className="account-meta">
                  Created {new Date(account.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Role badge */}
              <span className={`role-badge ${account.role}`}>{account.role}</span>

              {/* Action buttons */}
              <div className="account-actions">
                <button
                  className="account-action-btn"
                  onClick={() => {
                    setChangingId(changingId === account.id ? null : account.id);
                    setNewPass("");
                    setPassError("");
                    setPassSuccess("");
                  }}
                >
                  {changingId === account.id ? "Cancel" : "Change Password"}
                </button>

                {/* Can't delete your own account */}
                {account.username !== session.username && (
                  <button
                    className="account-action-btn delete"
                    onClick={() => handleDelete(account.id, account.username)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Inline change password form */}
            {changingId === account.id && (
              <div style={{ padding: "12px 24px 16px", background: "#f8fafc", borderBottom: "1px solid #f3f4f6" }}>
                <form className="settings-form" onSubmit={handleChangePass}
                  style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className="settings-label">NEW PASSWORD FOR {account.username.toUpperCase()}</label>
                    <input
                      className="settings-input"
                      type="password"
                      placeholder="At least 6 characters"
                      value={newPass}
                      onChange={e => { setNewPass(e.target.value); setPassError(""); }}
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="settings-btn primary" disabled={passLoading}>
                    {passLoading ? "Saving…" : "Save"}
                  </button>
                </form>
                {passError   && <div className="settings-error" style={{ marginTop: 8 }}>⚠ {passError}</div>}
                {passSuccess && <div className="settings-success" style={{ marginTop: 8 }}>✓ {passSuccess}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Main settings page --
export default function Settings({ session, onBack }) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Called when a new account is added — triggers the list to refresh
  const handleAccountAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="settings-page">

      {/* Reuse the same dark header style */}
      <div style={{ background: "#0f172a", padding: "0 28px" }}>
        <div style={{
          maxWidth: 800, margin: "0 auto",
          display: "flex", alignItems: "center",
          justifyContent: "space-between", height: 60,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              background: "linear-gradient(135deg,#10b981,#059669)",
              width: 32, height: 32, borderRadius: 9,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>🖥</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "white", letterSpacing: -0.5 }}>PisoNet</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>SETTINGS</div>
            </div>
          </div>
          <button className="back-btn" style={{ color: "#94a3b8" }} onClick={onBack}>
            ← Back to Dashboard
          </button>
        </div>
      </div>

      <div className="settings-content">

        {/* Page title */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 4px 0" }}>
            Account Settings
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
            Manage passwords and staff accounts
          </p>
        </div>

        {/* Change your own password */}
        <ChangePasswordForm session={session} />

        {/* Add a new account */}
        <AddAccountForm onAdded={handleAccountAdded} />

        {/* List all accounts */}
        <AccountsList session={session} onRefresh={refreshTrigger} />

      </div>
    </div>
  );
}
