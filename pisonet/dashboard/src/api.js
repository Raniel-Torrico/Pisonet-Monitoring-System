import axios from 'axios';

// Base setup for all API requests
// Every request will include the API key in the header
const api = axios.create({
  baseURL: 'http://localhost/pisonetV2/api',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key':    'pisonet123',
  }
});

// This runs before every request
// It reads the token from localStorage and adds it to the headers
// This way we don't have to manually pass the token every time
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pisonet_token');
  if (token) {
    config.headers['X-Auth-Token'] = token;
  }
  return config;
});

// Get all machines and their current status
export const getMachines = () =>
  api.get('/metrics.php');

// Get all unresolved alerts
export const getAlerts = () =>
  api.get('/alerts.php');

// Get audit logs — optional params: { actor, action, limit }
export const getLogs = (params = {}) =>
  api.get('/logs.php', { params });

// Get analytics — income totals, session stats, chart data
export const getAnalytics = () =>
  api.get('/analytics.php');

// Get all admin/staff accounts (admin only)
export const getAccounts = () =>
  api.get('/admins.php');

// Send a command (shutdown, restart, lock) to a machine
export const sendCommand = (machine_name, command) =>
  api.post('/command.php', {
    action: 'queue',
    machine_name,
    command,
    issued_by: 'admin',
  });

// Mark an alert as resolved
export const resolveAlert = (id) =>
  api.post('/alerts.php', { action: 'resolve', id });

// Admin login
export const login = (username, password) =>
  api.post('/login.php', { username, password });

// Add a new admin or staff account (admin only)
export const addAccount = (username, password, role) =>
  api.post('/admins.php', { action: 'add', username, password, role });

// Change password for an account
export const changePassword = (id, new_password, actor) =>
  api.post('/admins.php', { action: 'change_password', id, new_password, actor });

// Delete an account (admin only)
export const deleteAccount = (id) =>
  api.post('/admins.php', { action: 'delete', id });

export default api;
