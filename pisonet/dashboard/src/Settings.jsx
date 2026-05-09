import { useState, useEffect } from "react";
import { getAccounts, addAccount, changePassword, deleteAccount } from "./api";
import { checkPasswordStrength } from "./passwordStrength";
import PasswordStrengthIndicator from "./PasswordStrengthIndicator";
import "./Settings.css";

// -- Change password form (for your own account) --
function ChangePasswordForm({ session }) {
  const [newPass,     setNewPass]     = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [success,     setSuccess]     = useState("");
  const [error,       setError]       = useState("");
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");

    // Check password strength before submitting
    const { level } = checkPasswordStrength(newPass);
    if (level === "weak") {
      setError("Password is too weak. Please follow the rules below.");
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
        <p className="settings-card-title">Change Your Password</p>
        <p className="settings-card-subtitle">
          Updating password for <strong>{session.username}</strong>
        </p>
      </div>
      <div className="settings-card-body">
        <form className="settings-form" onSubmit={handleSubmit}>

          {/* New password */}
          <div>
            <label className="settings-label">NEW PASSWORD</label>
            <div className="password-wrapper" style={{ position: "relative" }}>
              <input
                className="settings-input"
                type={showNew ? "text" : "password"}
                placeholder="Enter new password"
                value={newPass}
                onChange={e => { setNewPass(e.target.value); setError(""); setSuccess(""); }}
                style={{ paddingRight: 52 }}
              />
              <button
                type="button"
                className="show-btn"
                onClick={() => setShowNew(p => !p)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            {/* Show strength indicator as user types */}
            <PasswordStrengthIndicator password={newPass} />
          </div>

          {/* Confirm password */}
          <div>
            <label className="settings-label">CONFIRM PASSWORD</label>
            <div style={{ position: "relative" }}>
              <input
                className="settings-input"
                type={showConfirm ? "text" : "password"}
                placeholder="Type the same password again"
                value={confirmPass}
                onChange={e => { setConfirmPass(e.target.value); setError(""); }}
                style={{ paddingRight: 52 }}
              />
              <button
                type="button"
                className="show-btn"
                onClick={() => setShowConfirm(p => !p)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>

            {/* Show mismatch warning while typing */}
            {confirmPass && newPass !== confirmPass && (
              <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>
                ✗ Passwords do not match
              </div>
            )}
            {confirmPass && newPass === confirmPass && (
              <div style={{ fontSize: 12, color: "#10b981", marginTop: 6 }}>
                ✓ Passwords match
              </div>
            )}
          </div>

          {error   && <div className="settings-error">⚠ {error}</div>}
          {success && <div className="settings-success">✓ {success}</div>}

          <div>
            <button
              type="submit"
              className="settings-btn primary"
              disabled={loading || checkPasswordStrength(newPass).level === "weak" || newPass !== confirmPass}
            >
              {loading ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -- Add new account form --
function AddAccountForm({ onAdded }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role,     setRole]     = useState("staff");
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (!username.trim()) {
      setError("Username is required");
      return;
    }

    // Block weak passwords
    const { level } = checkPasswordStrength(password);
    if (level === "weak") {
      setError("Password is too weak. Please follow the rules below.");
      return;
    }

    setLoading(true);
    try {
      const res = await addAccount(username.trim(), password, role);
      if (res.data.success) {
        setSuccess(`Account "${username}" created successfully`);
        setUsername("");
        setPassword("");
        setRole("staff");
        onAdded();
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
            <div style={{ position: "relative" }}>
              <input
                className="settings-input"
                type={showPass ? "text" : "password"}
                placeholder="Create a strong password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); setSuccess(""); }}
                style={{ paddingRight: 52 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
            <PasswordStrengthIndicator password={password} />
          </div>

          <div>
            <label className="settings-label">ROLE</label>
            <select
              className="settings-select"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="staff">Staff — can view the dashboard</option>
              <option value="admin">Admin — full access</option>
            </select>
          </div>

          {error   && <div className="settings-error">⚠ {error}</div>}
          {success && <div className="settings-success">✓ {success}</div>}

          <div>
            <button
              type="submit"
              className="settings-btn primary"
              disabled={loading || checkPasswordStrength(password).level === "weak"}
            >
              {loading ? "Creating…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -- Accounts list with inline password change --
function AccountsList({ session, onRefresh }) {
  const [accounts,    setAccounts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [changingId,  setChangingId]  = useState(null);
  const [newPass,     setNewPass]     = useState("");
  const [passError,   setPassError]   = useState("");
  const [passSuccess, setPassSuccess] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [showPass,    setShowPass]    = useState(false);

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

  const handleChangePass = async (e, accountId) => {
    e.preventDefault();
    setPassError("");
    setPassSuccess("");

    // Block weak passwords
    const { level } = checkPasswordStrength(newPass);
    if (level === "weak") {
      setPassError("Password is too weak. Please follow the strength rules.");
      return;
    }

    setPassLoading(true);
    try {
      const res = await changePassword(accountId, newPass, session.username);
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

            {/* Account row */}
            <div className="account-row">
              <div className={`account-avatar ${account.role}`}>
                {account.username[0].toUpperCase()}
              </div>
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
              <span className={`role-badge ${account.role}`}>{account.role}</span>
              <div className="account-actions">
                <button
                  className="account-action-btn"
                  onClick={() => {
                    setChangingId(changingId === account.id ? null : account.id);
                    setNewPass("");
                    setPassError("");
                    setPassSuccess("");
                    setShowPass(false);
                  }}
                >
                  {changingId === account.id ? "Cancel" : "Change Password"}
                </button>
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

            {/* Inline password change panel */}
            {changingId === account.id && (
              <div style={{ padding: "16px 24px 20px", background: "#f8fafc", borderBottom: "1px solid #f3f4f6" }}>
                <form className="settings-form" onSubmit={e => handleChangePass(e, account.id)}>

                  <div>
                    <label className="settings-label">
                      NEW PASSWORD FOR {account.username.toUpperCase()}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        className="settings-input"
                        type={showPass ? "text" : "password"}
                        placeholder="Enter a strong password"
                        value={newPass}
                        onChange={e => { setNewPass(e.target.value); setPassError(""); }}
                        style={{ paddingRight: 52 }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(p => !p)}
                        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 12 }}
                      >
                        {showPass ? "Hide" : "Show"}
                      </button>
                    </div>
                    <PasswordStrengthIndicator password={newPass} />
                  </div>

                  {passError   && <div className="settings-error">⚠ {passError}</div>}
                  {passSuccess && <div className="settings-success">✓ {passSuccess}</div>}

                  <div>
                    <button
                      type="submit"
                      className="settings-btn primary"
                      disabled={passLoading || checkPasswordStrength(newPass).level === "weak"}
                    >
                      {passLoading ? "Saving…" : "Save Password"}
                    </button>
                  </div>
                </form>
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

  const handleAccountAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="settings-page">

      {/* Header */}
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
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 4px 0" }}>
            Account Settings
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
            {session.role === "admin"
              ? "Manage passwords and staff accounts"
              : "You can change your own password here"}
          </p>
        </div>

        {/* Everyone can change their own password */}
        <ChangePasswordForm session={session} />

        {/* Only admins can add accounts and manage others */}
        {session.role === "admin" && (
          <>
            <AddAccountForm onAdded={handleAccountAdded} />
            <AccountsList session={session} onRefresh={refreshTrigger} />
          </>
        )}
      </div>
    </div>
  );
}
