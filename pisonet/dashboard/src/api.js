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

// Attach auth token automatically to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pisonet_token');
  if (token) config.headers['X-Auth-Token'] = token;
  return config;
});

// -- Machine monitoring --
export const getMachines  = ()                      => api.get('/metrics.php');
export const getAlerts    = ()                      => api.get('/alerts.php');
export const getLogs      = (params = {})           => api.get('/logs.php', { params });
export const getAnalytics = ()                      => api.get('/analytics.php');

// -- Commands --
export const sendCommand  = (machine_name, command) =>
  api.post('/command.php', { action: 'queue', machine_name, command, issued_by: 'admin' });

export const resolveAlert = (id) =>
  api.post('/alerts.php', { action: 'resolve', id });

// -- Auth --
export const login        = (username, password)    => api.post('/login.php', { username, password });

// -- Account management --
export const getAccounts    = ()                          => api.get('/admins.php');
export const addAccount     = (username, password, role)  => api.post('/admins.php', { action: 'add', username, password, role });
export const changePassword = (id, new_password, actor)   => api.post('/admins.php', { action: 'change_password', id, new_password, actor });
export const deleteAccount  = (id)                        => api.post('/admins.php', { action: 'delete', id });

// -- Troubleshooting --

// Get running processes for a machine
export const getProcesses = (machine_name) =>
  api.get('/processes.php', { params: { machine_name } });

// Kill a process by PID
export const killProcess = (machine_name, pid, process_name) =>
  api.post('/processes.php', { action: 'kill', machine_name, pid, process_name });

// Request a screenshot from a machine (queues a command)
export const requestScreenshot = (machine_name) =>
  api.post('/command.php', { action: 'queue', machine_name, command: 'screenshot', issued_by: 'admin' });

// Get the latest screenshot for a machine
export const getScreenshot = (machine_name) =>
  api.get('/screenshot.php', { params: { machine_name } });

// Get Windows event logs for a machine
export const getEventLogs = (machine_name) =>
  api.get('/eventlogs.php', { params: { machine_name } });

// Get hardware health scores and maintenance recommendations
export const getHealth = () =>
  api.get('/health.php');

// Get report data for PDF generation
// type: 'daily', 'weekly', or 'monthly'
export const getReport = (type = 'weekly') =>
  api.get('/report.php', { params: { type } });

export default api;
