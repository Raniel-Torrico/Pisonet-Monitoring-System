import { useState } from "react";
import { login } from "./api";
import "./Login.css";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) { setError("Username is required"); return; }
    if (!password.trim()) { setError("Password is required"); return; }

    setLoading(true);
    try {
      const res = await login(username.trim(), password.trim());

      if (res.data.success) {
        const { id, token, username: user, role, expires } = res.data.data;

        // Save login info to localStorage so user stays logged in on refresh
        localStorage.setItem("pisonet_id",       id);
        localStorage.setItem("pisonet_token",    token);
        localStorage.setItem("pisonet_username", user);
        localStorage.setItem("pisonet_role",     role);
        localStorage.setItem("pisonet_expires",  expires);

        onLogin({ id, token, username: user, role });
      } else {
        setError(res.data.message || "Login failed");
      }
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.message || "Login failed");
      } else {
        setError("Cannot reach server — check that XAMPP is running");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">

        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-icon">🖥</div>
          <div className="login-logo-title">PisoNet</div>
          <div className="login-logo-subtitle">Shop Management System</div>
        </div>

        {/* Login card */}
        <div className="login-card">
          <h2>Welcome back</h2>
          <p>Sign in to your admin account</p>

          <form className="login-form" onSubmit={handleSubmit}>

            <div>
              <label className="login-label">USERNAME</label>
              <input
                className="login-input"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(""); }}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="login-label">PASSWORD</label>
              <div className="password-wrapper">
                <input
                  className="login-input"
                  type={showPass ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  autoComplete="current-password"
                  style={{ paddingRight: 52 }}
                />
                <button type="button" className="show-btn" onClick={() => setShowPass(p => !p)}>
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && <div className="login-error">⚠ {error}</div>}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>

          </form>
        </div>

        <div className="login-hint">
          Default: admin / admin123 — change after first login
        </div>
      </div>
    </div>
  );
}
