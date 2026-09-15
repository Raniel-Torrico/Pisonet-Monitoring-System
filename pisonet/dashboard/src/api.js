import axios from 'axios';

// api.js — smart detection
async function detectServer() {
  const CLOUD_URL = 'https://monitonet.com/pisonetV2/api';
  const LOCAL_URL  = 'http://192.168.1.6/pisonetV2/api';

  try {
    // try cloud first with a short timeout
    await axios.get(`${CLOUD_URL}/metrics.php`, { 
      headers: { 'X-API-Key': 'pisonet123' }, 
      timeout: 2000 
    });
    return CLOUD_URL;
  } catch {
    // cloud failed, try local
    try {
      await axios.get(`${LOCAL_URL}/metrics.php`, { 
        headers: { 'X-API-Key': 'pisonet123' }, 
        timeout: 2000 
      });
      return LOCAL_URL;
    } catch {
      return CLOUD_URL; // both failed, default to cloud (will show error)
    }
  }
}

let BASE_URL = 'https://monitonet.com/pisonetV2/api'; // default

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json', 'X-API-Key': 'pisonet123' }
});

// detect and update on app start
detectServer().then(url => {
  BASE_URL = url;
  api.defaults.baseURL = url;
  console.log('Using server:', url);
});

// Attach auth token automatically to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pisonet_token');
  if (token) config.headers['X-Auth-Token'] = token;
  return config;
});

// -- Machine monitoring --
export const getMachines  = ()             => api.get('/metrics.php');
export const getAlerts    = ()             => api.get('/alerts.php');
export const getLogs      = (params = {})  => api.get('/logs.php', { params });
export const getAnalytics = ()             => api.get('/analytics.php');

// -- Commands --
export const sendCommand  = (machine_name, command) =>
  api.post('/command.php', { action: 'queue', machine_name, command, issued_by: 'admin' });
export const resolveAlert = (id) =>
  api.post('/alerts.php', { action: 'resolve', id });

// -- Auth --
export const login = (username, password) =>
  api.post('/login.php', { username, password });

// -- Account management --
export const getAccounts    = ()                         => api.get('/admins.php');
export const addAccount     = (username, password, role) => api.post('/admins.php', { action: 'add', username, password, role });
export const changePassword = (id, new_password, actor)  => api.post('/admins.php', { action: 'change_password', id, new_password, actor });
export const deleteAccount  = (id)                       => api.post('/admins.php', { action: 'delete', id });

// -- Troubleshooting --
export const getProcesses      = (machine_name) => api.get('/processes.php', { params: { machine_name } });
export const killProcess       = (machine_name, pid, process_name) => api.post('/processes.php', { action: 'kill', machine_name, pid, process_name });
export const restartApp = (machine_name, exe_path) => api.post('/command.php', { action: 'queue', machine_name, command: `restart_app:${exe_path}`, issued_by: 'admin' });
export const requestScreenshot = (machine_name) => api.post('/command.php', { action: 'queue', machine_name, command: 'screenshot', issued_by: 'admin' });
export const getScreenshot     = (machine_name) => api.get('/screenshot.php', { params: { machine_name } });
export const getEventLogs      = (machine_name) => api.get('/eventlogs.php', { params: { machine_name } });

// -- Health --
export const getHealth = () => api.get('/health.php');

// -- Reports --
export const getReport = (type = 'weekly') => api.get('/report.php', { params: { type } });

// -- Wake-on-LAN --
export const wakeMachine = (machine_name) =>
  api.post('/command.php', { action: 'queue', machine_name, command: 'wake', issued_by: 'admin' });

export const wakeAllMachines = (machineNames) =>
  Promise.all(machineNames.map(name => wakeMachine(name)));

export const updateMachineRate = (machine_name, pesos_per_minute) =>
  api.post('/machine_settings.php', { machine_name, pesos_per_minute });

export const refreshSpecs = (machine_name) =>
  api.post('/command.php', { action: 'queue', machine_name, command: 'refresh_specs', issued_by: 'admin' });

export const archiveMachine  = (machine_name) => api.post('/machine_manage.php', { action: 'archive', machine_name });
export const restoreMachine  = (machine_name) => api.post('/machine_manage.php', { action: 'restore', machine_name });
export const deleteMachine   = (machine_name) => api.post('/machine_manage.php', { action: 'delete', machine_name });
export const getArchivedMachines = () => api.get('/archived_machines.php');


export default api;
