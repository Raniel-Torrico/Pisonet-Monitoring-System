"""
Pisonet Client
Runs in the background on each PC unit.
Registers the PC with the server, sends CPU/RAM updates,
listens for commands, and manages coin-based sessions.

Compatible with both normal and diskless setups.
See DISKLESS MODE section below for configuration.

How to build the .exe:
    1. Install required packages:
       pip install pyinstaller requests psutil

    2. Build:
       pyinstaller --onefile --noconsole client.py
       python -m PyInstaller --onefile --noconsole client.py
       to setup the screenshot:
       pip install pillow
       python -m PyInstaller --onefile --noconsole client.py

    3. The .exe will be inside the dist/ folder.

    4. Place pisonet_client.txt in the same folder as client.exe
       and write your server IP inside it:
       http://192.168.1.7/pisonetV2/api
"""

import os
import sys
import time
import uuid
import socket
import platform
import threading
import subprocess
import ctypes
import logging
import tkinter as tk

import requests
import psutil
import base64
import io

# Screenshot library — install with: pip install pillow
try:
    from PIL import ImageGrab
    SCREENSHOT_AVAILABLE = True
except ImportError:
    SCREENSHOT_AVAILABLE = False

# Windows event log library — install with: pip install pywin32
try:
    import win32evtlog
    EVENTLOG_AVAILABLE = True
except ImportError:
    EVENTLOG_AVAILABLE = False


# ── Settings ───────────────────────────────────────────────────────────────────
DEFAULT_SERVER_URL    = 'https://monitonet.com/pisonetV2/api'
API_KEY               = 'pisonet123'  # must match config.php
HEARTBEAT_INTERVAL    = 3   # seconds between each heartbeat
COMMAND_POLL_INTERVAL  = 2    # seconds between each command check
PESOS_PER_MINUTE       = 5.0  # 1 peso = 5 minutes, updated after registration
PROCESS_SEND_INTERVAL  = 10   # seconds between each process list update
SCREENSHOT_ON_REQUEST  = True # take screenshot when dashboard requests it
EVENTLOG_SEND_INTERVAL = 60   # seconds between each event log update
CLIENT_VERSION = '1.0.0'


# ── DISKLESS MODE ──────────────────────────────────────────────────────────────
# Set LOG_TO_SERVER = True for diskless setups where local file storage
# is not available. Logs will be sent to the server database instead.
# Set LOG_TO_SERVER = False for normal setups to keep logs as a local file.
#
# Set COIN_FROM_SERVER = True for diskless setups where insert_coin.txt
# cannot be written locally. The server will send coin triggers as commands.
# Set COIN_FROM_SERVER = False for normal setups to use the local file trigger.
#
# Both modes can run at the same time — you can enable one or both.
LOG_TO_SERVER   = False  # True = diskless, False = normal local file
COIN_FROM_SERVER = False  # True = diskless, False = local insert_coin.txt


# ── Log file setup ─────────────────────────────────────────────────────────────
# Only writes to file if LOG_TO_SERVER is False
logging.basicConfig(
    filename='pisonet_client.log' if not LOG_TO_SERVER else os.devnull,
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)


# ── Request headers ────────────────────────────────────────────────────────────
HEADERS = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
}


# ── Global state ───────────────────────────────────────────────────────────────
# These are set after registration and used by all threads
MACHINE_NAME = 'UNKNOWN'

# Session state shared between threads — always access inside session_lock
session_lock      = threading.Lock()
session_active    = False
session_remaining = 0
session_pesos     = 0.0


# ── Server URLs ────────────────────────────────────────────────────────────────
CLOUD_URL = 'https://monitonet.com/pisonetV2/api'
LOCAL_URL  = 'http://localhost/pisonetV2/api'

def get_server_url():
    """
    Reads URL from pisonet_client.txt if it exists.
    Falls back to cloud URL by default.
    """
    exe_dir     = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else __file__)
    config_path = os.path.join(exe_dir, 'pisonet_client.txt')
    if os.path.exists(config_path):
        url = open(config_path).read().strip().rstrip('/')
        log.info(f'Server URL loaded from pisonet_client.txt: {url}')
        return url
    return CLOUD_URL.rstrip('/')


def get_local_url():
    """
    Reads local server URL from pisonet_client_local.txt if it exists.
    Falls back to localhost by default.
    """
    exe_dir     = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else __file__)
    local_path  = os.path.join(exe_dir, 'pisonet_client_local.txt')
    if os.path.exists(local_path):
        url = open(local_path).read().strip().rstrip('/')
        log.info(f'Local server URL loaded from pisonet_client_local.txt: {url}')
        return url
    return LOCAL_URL.rstrip('/')


def is_server_reachable(url):
    """
    Quick check if a server is reachable.
    Returns True if reachable, False if not.
    """
    try:
        requests.get(f'{url}/metrics.php', headers=HEADERS, timeout=2)
        return True
    except Exception:
        return False


# ── MAC address ────────────────────────────────────────────────────────────────
def get_mac():
    """
    Gets the MAC address of the Ethernet adapter.
    Works in both normal and diskless setups since MAC is hardware-based.
    """
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(
                ['getmac', '/fo', 'csv', '/nh', '/v'],
                capture_output=True, text=True
            )
            for line in result.stdout.strip().split('\n'):
                parts = [p.strip().strip('"') for p in line.split(',')]
                if len(parts) >= 4:
                    conn_name = parts[0].lower()
                    mac_raw   = parts[2].replace('-', ':').lower()
                    transport = parts[3].lower()
                    if 'disconnected' in transport:
                        continue
                    if 'ethernet' in conn_name:
                        log.info(f'Using Ethernet MAC: {mac_raw}')
                        return mac_raw
            for line in result.stdout.strip().split('\n'):
                parts = [p.strip().strip('"') for p in line.split(',')]
                if len(parts) >= 4 and 'disconnected' not in parts[3].lower():
                    mac_raw = parts[2].replace('-', ':').lower()
                    log.info(f'Using fallback MAC: {mac_raw}')
                    return mac_raw
    except Exception as e:
        log.warning(f'getmac failed: {e}')

    raw = uuid.UUID(int=uuid.getnode()).hex[-12:]
    return ':'.join(raw[i:i+2] for i in range(0, 12, 2))


# ── System metrics ─────────────────────────────────────────────────────────────
def get_metrics():
    return {
        'cpu':    round(psutil.cpu_percent(interval=1), 1),
        'ram':    round(psutil.virtual_memory().percent, 1),
        'disk':   round(psutil.disk_usage('/').percent, 1),
        'uptime': int(time.time() - psutil.boot_time()),
    }

def get_all_disks_total():
    """
    Sums up total and free space across all LOCAL FIXED drives only —
    excludes network drives, removable/USB drives, and CD/DVD drives
    to avoid inflated totals.
    """
    total_all = 0
    free_all  = 0
    for partition in psutil.disk_partitions(all=False):
        # skip anything that isn't a genuine fixed local drive
        opts = partition.opts.lower() if partition.opts else ''
        if 'cdrom' in opts or 'removable' in opts:
            continue
        if partition.fstype == '':  # often indicates a non-mounted or network path
            continue
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            total_all += usage.total
            free_all  += usage.free
        except (PermissionError, OSError):
            continue
    return total_all, free_all
    
def get_cpu_name():
    """
    Gets the actual marketed CPU name using PowerShell's CIM cmdlets,
    since wmic is being phased out on newer Windows 11 builds.
    """
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(
                ['powershell', '-NoProfile', '-Command',
                 '(Get-CimInstance -ClassName Win32_Processor).Name'],
                capture_output=True, text=True, timeout=10
            )
            name = result.stdout.strip()
            if name:
                return name
    except Exception:
        pass

    return platform.processor() or "Unknown CPU"

def get_hardware_specs():
    """
    Collects static hardware info. Sent once at registration,
    and again whenever the Refresh Specs button is clicked.
    """
    cpu_info = get_cpu_name()
    cpu_cores = psutil.cpu_count(logical=True)

    total_ram_gb  = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    total_bytes, free_bytes = get_all_disks_total()
    total_disk_gb = round(total_bytes / (1024 ** 3), 1)
    free_disk_gb  = round(free_bytes / (1024 ** 3), 1)

    os_info  = f"{platform.system()} {platform.release()}"
    win_user = os.getlogin() if hasattr(os, 'getlogin') else 'Unknown'

    system_model = 'Unknown'
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(
                ['wmic', 'computersystem', 'get', 'model', '/value'],
                capture_output=True, text=True
            )
            for line in result.stdout.strip().split('\n'):
                if line.startswith('Model='):
                    model = line.split('=', 1)[1].strip()
                    if model and model not in ('', 'System Product Name', 'To Be Filled By O.E.M.'):
                        system_model = model
                        break
            if system_model == 'Unknown':
                result = subprocess.run(
                    ['wmic', 'baseboard', 'get', 'product', '/value'],
                    capture_output=True, text=True
                )
                for line in result.stdout.strip().split('\n'):
                    if line.startswith('Product='):
                        board = line.split('=', 1)[1].strip()
                        if board and board not in ('', 'To Be Filled By O.E.M.'):
                            system_model = f'Motherboard: {board}'
                            break
    except Exception:
        pass

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip_address = s.getsockname()[0]
        s.close()
    except Exception:
        ip_address = 'Unknown'

    return {
        'cpu_model':      cpu_info,
        'cpu_cores':      cpu_cores,
        'total_ram':      total_ram_gb,
        'total_disk':     total_disk_gb,
        'free_disk':      free_disk_gb,
        'os_info':        os_info,
        'win_user':       win_user,
        'system_model':   system_model,
        'ip_address':     ip_address,
        'client_version': CLIENT_VERSION,
    }

# ── Logging helper ─────────────────────────────────────────────────────────────
def client_log(server_url, level, message):
    """
    Logs a message.
    - If LOG_TO_SERVER is True: sends log to server database (diskless mode)
    - Always logs to local file if LOG_TO_SERVER is False (normal mode)
    Both can run at the same time if needed.
    """
    # Local file logging
    if level == 'INFO':    log.info(message)
    elif level == 'WARNING': log.warning(message)
    elif level == 'ERROR':   log.error(message)

    # Server logging (diskless mode)
    if LOG_TO_SERVER and server_url:
        try:
            requests.post(
                f'{server_url}/clientlog.php',
                json={
                    'machine_name': socket.gethostname(),
                    'level':        level,
                    'message':      message,
                },
                headers=HEADERS,
                timeout=3,
            )
        except Exception:
            pass  # Don't crash if server log fails


# ── HTTP helpers ───────────────────────────────────────────────────────────────
def post(server_url, endpoint, payload, timeout=5):
    try:
        resp = requests.post(
            f'{server_url}/{endpoint}',
            json=payload, headers=HEADERS, timeout=timeout,
        )
        data = resp.json()
        if not data.get('success'):
            log.warning(f'POST {endpoint} → {data.get("message")}')
        return data
    except requests.exceptions.ConnectionError:
        log.warning(f'POST {endpoint} → server unreachable')
    except Exception as e:
        log.error(f'POST {endpoint} → error: {e}')
    return None

def get(server_url, endpoint, params):
    try:
        resp = requests.get(
            f'{server_url}/{endpoint}',
            params=params, headers=HEADERS, timeout=5,
        )
        data = resp.json()
        if not data.get('success'):
            log.warning(f'GET {endpoint} → {data.get("message")}')
        return data
    except requests.exceptions.ConnectionError:
        log.warning(f'GET {endpoint} → server unreachable')
    except Exception as e:
        log.error(f'GET {endpoint} → error: {e}')
    return None


# ── Registration ───────────────────────────────────────────────────────────────
def register(server_url):
    """
    Registers this PC with the server using its MAC address.
    Tries cloud first, falls back to local if cloud is unreachable.
    """
    local_url = get_local_url()
    
    payload = {
        'mac':      get_mac(),
        'hostname': socket.gethostname(),
    }
    log.info(f'Registering — MAC: {payload["mac"]}, hostname: {payload["hostname"]}')

    while True:
        # try cloud first, then local
        for current_server in [server_url, local_url]:
            result = post(current_server, 'register.php', payload)
            if result and result.get('success') and result.get('data'):
                config = result['data']
                # save which server worked so all threads use the same one
                log.info(f'Registered as: {config["machine_name"]} via {current_server}')

                specs = get_hardware_specs()
                specs['machine_name'] = config['machine_name']
                post(current_server, 'specs.php', specs)
                log.info('Hardware specs sent')

                return config, current_server  # ← return both config AND working server

        log.warning('Registration failed on all servers. Retrying in 5s...')
        time.sleep(5)


# ── Heartbeat thread ───────────────────────────────────────────────────────────
def heartbeat_loop(server_url, machine_name):
    """
    Sends heartbeat to cloud first.
    If cloud is unreachable, sends to local server instead.
    This ensures machine status is always recorded somewhere.
    """
    local_url = get_local_url()

    while True:
        metrics = get_metrics()
        metrics['machine_name'] = machine_name

        # try cloud first
        sent = False
        for current_server in [server_url, local_url]:
            try:
                resp = requests.post(
                    f'{current_server}/heartbeat.php',
                    json=metrics,
                    headers=HEADERS,
                    timeout=5,
                )
                data = resp.json()
                if data.get('success'):
                    sent = True
                    break  # cloud worked, no need to try local
            except Exception:
                continue  # try next server

        if not sent:
            log.warning('Heartbeat failed on all servers')

        time.sleep(HEARTBEAT_INTERVAL)


# ── Session timer thread ───────────────────────────────────────────────────────
def session_timer_loop(server_url, machine_name):
    global session_active, session_remaining, session_deadline

    while True:
        time.sleep(0.5)  

        with session_lock:
            if not session_active or session_deadline is None:
                continue
            remaining = session_deadline - time.monotonic()  # ← calculate from wall clock
            session_remaining = max(0, int(remaining))

        if int(remaining) % 10 == 0 and remaining > 0:
            client_log(server_url, 'INFO', f'Timer tick: {int(remaining)}s left')

        if remaining <= 0:
            client_log(server_url, 'INFO', '>>> TIMER EXPIRED — calling cmd_lock now')
            
            with session_lock:
                session_active    = False
                session_remaining = 0
                session_deadline  = None

            cmd_lock()
            client_log(server_url, 'INFO', '>>> cmd_lock() was called')


            threading.Thread(
                target=end_session,
                args=(server_url, machine_name),
                daemon=True
            ).start()

            
            


# ── Session functions ──────────────────────────────────────────────────────────
def start_session(server_url, machine_name, pesos):
    global session_active, session_remaining, session_pesos, PESOS_PER_MINUTE, session_deadline

    result = post(server_url, 'session.php', {
        'action':       'start',
        'machine_name': machine_name,
        'pesos':        pesos,
    }, timeout=10)

    if result and result.get('success'):
        # Calculate total seconds using the global PESOS_PER_MINUTE
        # which was set after registration
        rate          = PESOS_PER_MINUTE if PESOS_PER_MINUTE > 0 else 5.0
        total_seconds = int(float(pesos) * float(rate) * 60)

        client_log(server_url, 'INFO', f'Calculating time: P{pesos} x {rate} min/peso x 60 = {total_seconds}s')

        with session_lock:
            session_active    = True
            session_remaining = total_seconds
            session_pesos     = float(pesos)
            session_deadline  = time.monotonic() + total_seconds

        client_log(server_url, 'INFO', f'Session started — P{pesos} = {total_seconds}s ({total_seconds//60}min {total_seconds%60}sec)')
        return result['data']['session_id']

    client_log(server_url, 'WARNING', 'Server rejected session start')
    return None


def end_session(server_url, machine_name):
    global session_active, session_remaining, session_deadline

    with session_lock:
        session_active    = False
        session_remaining = 0
        session_deadline  = None

    result = post(server_url, 'session.php', {
        'action':       'end',
        'machine_name': machine_name,
    })

    if result and result.get('success'):
        client_log(server_url, 'INFO', 'Session ended')
    else:
        client_log(server_url, 'WARNING', 'Failed to notify server of session end')

# ── Customer Countdown Overlay ─────────────────────────────────────────────────
# Small always-on-top window showing the customer their remaining time.
# Runs on the main thread since tkinter requires it.

overlay_root  = None
overlay_label = None

def create_overlay():
    """
    Builds the borderless, always-on-top overlay window.
    Starts hidden — only appears when a session is active.
    """
    global overlay_root, overlay_label

    overlay_root = tk.Tk()
    overlay_root.overrideredirect(True)   # no title bar / borders
    overlay_root.attributes('-topmost', True)
    overlay_root.attributes('-alpha', 0.75)  # more see-through
    overlay_root.configure(bg='#0f172a')

    width, height = 190, 60
    screen_w = overlay_root.winfo_screenwidth()
    screen_h = overlay_root.winfo_screenheight()
    x = screen_w - width - 20
    y = screen_h - height - 60  # sits above the taskbar
    overlay_root.geometry(f'{width}x{height}+{x}+{y}')

    overlay_label = tk.Label(
        overlay_root,
        text='',
        font=('Segoe UI', 14, 'bold'),
        bg='#0f172a',
        fg='#10b981',
        justify='center',
    )
    overlay_label.pack(expand=True, fill='both')
    overlay_label.bind('<ButtonPress-1>', start_drag)
    overlay_label.bind('<B1-Motion>', do_drag)
    overlay_root.withdraw()  # start hidden until a session begins
    poll_overlay()


def poll_overlay():
    """
    Reads the current session state every 500ms and updates the overlay.
    Hides the window when there's no active session.
    """
    global overlay_root, overlay_label

    with session_lock:
        is_active = session_active
        remaining = session_remaining
        pesos     = session_pesos

    if is_active and remaining > 0:
        mins = remaining // 60
        secs = remaining % 60
        overlay_label.config(
            text=f'⏱ {mins:02d}:{secs:02d}\n₱{pesos:g} remaining',
            fg='#ef4444' if remaining < 300 else '#10b981',  # red under 5 min
        )
        overlay_root.deiconify()  # show
    else:
        overlay_root.withdraw()  # hide

    overlay_root.after(500, poll_overlay)

def start_drag(event):
    """Records the mouse position when the user starts dragging."""
    overlay_root._drag_start_x = event.x
    overlay_root._drag_start_y = event.y


def do_drag(event):
    """Moves the overlay window as the mouse moves while dragging."""
    x = overlay_root.winfo_pointerx() - overlay_root._drag_start_x
    y = overlay_root.winfo_pointery() - overlay_root._drag_start_y
    overlay_root.geometry(f'+{x}+{y}')

def add_time(server_url, machine_name, pesos):
    global session_active, session_remaining, session_deadline
    extra_seconds = int(pesos * PESOS_PER_MINUTE * 60)

    with session_lock:
        is_active = session_active

    if is_active:
        result = post(server_url, 'session.php', {
            'action':       'add_time',
            'machine_name': machine_name,
            'pesos':        pesos,
        })

        if not result or not result.get('success'):
            client_log(server_url, 'WARNING', f'Server rejected add_time: {result.get("message") if result else "no response"}')
            return
            
        with session_lock:
            session_deadline  += extra_seconds
            session_remaining += extra_seconds
        client_log(server_url, 'INFO', f'Added P{pesos} = {extra_seconds} more seconds')
    else:
        start_session(server_url, machine_name, pesos)


# ── Command handlers ───────────────────────────────────────────────────────────
def cmd_shutdown():
    log.info('Running: shutdown')
    if platform.system() == 'Windows':
        subprocess.run(['shutdown', '/s', '/t', '10'])
    else:
        subprocess.run(['shutdown', '-h', '+0'])

def cmd_restart():
    log.info('Running: restart')
    if platform.system() == 'Windows':
        subprocess.run(['shutdown', '/r', '/t', '10'])
    else:
        subprocess.run(['shutdown', '-r', '+0'])

def cmd_lock():
    log.info('Running: lock')
    if platform.system() == 'Windows':
        ctypes.windll.user32.LockWorkStation()
    else:
        subprocess.run(['gnome-screensaver-command', '--lock'])

def cmd_unlock():
    log.info('Running: unlock (no action needed)')

def cmd_insert_coin(pesos_str, server_url, machine_name):
    """
    Handles a coin insert command from the server.
    Used in diskless mode where insert_coin.txt cannot be written locally.
    """
    try:
        pesos = float(pesos_str)
        if pesos > 0:
            MAX_HOURS     = 15
            total_minutes = pesos * PESOS_PER_MINUTE
            if total_minutes > (MAX_HOURS * 60):
                client_log(server_url, 'WARNING', f'P{pesos} exceeds 15hr limit, ignoring')
        else:
            client_log(server_url, 'INFO', f'Server coin trigger: P{pesos}')
            with session_lock:
                is_active = session_active
            if is_active:
                add_time(server_url, machine_name, pesos)
            else:
                start_session(server_url, machine_name, pesos)
    except ValueError:
        client_log(server_url, 'WARNING', f'Invalid coin amount from server: {pesos_str}')

COMMAND_MAP = {
    'shutdown': cmd_shutdown,
    'restart':  cmd_restart,
    'lock':     cmd_lock,
    'unlock':   cmd_unlock,
}


# ── Command poll thread ────────────────────────────────────────────────────────
def command_poll_loop(server_url, machine_name):
    """
    Checks for commands from cloud first, then local server as fallback.
    Cloud first = instant commands when internet is up.
    Local fallback = still works when internet is down.
    """
    local_url = get_local_url()

    while True:
        # always try cloud first, then local as fallback
        servers = [server_url, local_url]

        for current_server in servers:
            try:
                resp = requests.get(
                    f'{current_server}/get_command.php',
                    params={'machine_name': machine_name},
                    headers=HEADERS,
                    timeout=2,  # short timeout so fallback is fast
                )
                result = resp.json()
            except Exception:
                # this server failed, try the next one
                continue

            if not result.get('success'):
                break  # server responded but something wrong, skip

            cmd_data = result.get('data', {})
            cmd_id   = cmd_data.get('id')
            command  = cmd_data.get('command')

            if not cmd_id or not command:
                break  # no pending command on this server

            # acknowledge on the SAME server the command came from
            try:
                requests.post(
                    f'{current_server}/command.php',
                    json={
                        'action': 'ack',
                        'id':     cmd_id,
                        'status': 'executed',
                    },
                    headers=HEADERS,
                    timeout=3,
                )
            except Exception:
                pass  # ack failed but still run the command

            # handle each command type
            if command.startswith('coin:'):
                pesos_str = command.split('coin:')[1]
                cmd_insert_coin(pesos_str, current_server, machine_name)

            elif command.startswith('kill:'):
                pid     = int(command.split('kill:')[1])
                success = kill_process(pid)
                client_log(current_server, 'INFO',
                    f'Kill PID {pid}: {"success" if success else "failed"}')

            elif command.startswith('restart_app:'):
                exe_path = command.split('restart_app:')[1]
                success = restart_application(exe_path)
                client_log(current_server, 'INFO', f'Restart app {exe_path}: {"success" if success else "failed"}')

            elif command == 'screenshot':
                threading.Thread(
                    target=take_screenshot,
                    args=(current_server, machine_name),
                    daemon=True
                ).start()

          
            elif command == 'refresh_specs':
                specs = get_hardware_specs()
                specs['machine_name'] = machine_name
                post(current_server, 'specs.php', specs)
                client_log(current_server, 'INFO', 'Specs refreshed on request')


            elif command in COMMAND_MAP:
                try:
                    COMMAND_MAP[command]()
                    client_log(current_server, 'INFO',
                        f'Command executed: {command}')
                except Exception as e:
                    client_log(current_server, 'ERROR',
                        f'Command "{command}" failed: {e}')
            else:
                client_log(current_server, 'WARNING',
                    f'Unknown command: {command}')

            break  # command found and handled, stop checking other servers

        time.sleep(COMMAND_POLL_INTERVAL)


# ── Normal mode: file-based coin trigger ───────────────────────────────────────
def file_coin_watcher(server_url, machine_name):
    """
    Normal mode coin trigger — watches for insert_coin.txt next to the .exe.
    Only runs if COIN_FROM_SERVER is False.

    To simulate a coin insert during testing:
      1. Create insert_coin.txt next to client.exe
      2. Write the peso amount inside (e.g. 5)
      3. Client reads it, starts session, deletes the file
    """
    exe_dir      = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else __file__)
    trigger_file = os.path.join(exe_dir, 'insert_coin.txt')

    client_log(server_url, 'INFO', 'File coin watcher started (normal mode)')

    while True:
        if os.path.exists(trigger_file):
            try:
                content = open(trigger_file).read().strip()
                pesos   = float(content)

                if pesos > 0:

                    MAX_HOURS     = 15
                    total_minutes = pesos * PESOS_PER_MINUTE
                    if total_minutes > (MAX_HOURS * 60):
                        client_log(server_url, 'WARNING', f'P{pesos} exceeds 15hr limit, ignoring')
                    else:
                        client_log(server_url, 'INFO', f'File coin trigger: P{pesos}')
                        with session_lock:
                            is_active = session_active
                        if is_active:
                            add_time(server_url, machine_name, pesos)
                        else:
                            start_session(server_url, machine_name, pesos)

            except ValueError:
                client_log(server_url, 'WARNING', f'insert_coin.txt has invalid content: "{content}"')
            except Exception as e:
                client_log(server_url, 'ERROR', f'File coin watcher error: {e}')
            finally:
                try:
                    os.remove(trigger_file)
                except:
                    pass

        time.sleep(1)


# ── Process list functions ─────────────────────────────────────────────────────
def get_process_list():
    """
    Returns a list of all running processes with name, PID, CPU, RAM usage,
    and the full executable path (needed for the Restart Application feature).
    Excludes this client's own process to prevent accidental self-restart.
    """
    own_pid = os.getpid()
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'exe']):
        try:
            info = proc.info
            pid = info.get('pid')

            if pid == own_pid:
                continue  # never list ourselves as a restartable process

            exe_path = info.get('exe') or ''
            # only keep exe paths that are actual files, not folders
            if exe_path and not (exe_path.endswith('.exe') and os.path.isfile(exe_path)):
                exe_path = ''

            processes.append({
                'pid':    pid,
                'name':   info.get('name') or 'Unknown',
                'cpu':    round(info.get('cpu_percent') or 0, 1),
                'ram':    round(info.get('memory_percent') or 0, 1),
                'exe':    exe_path,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, KeyError):
            continue

    processes.sort(key=lambda p: p['cpu'], reverse=True)
    return processes[:50]


def process_send_loop(server_url, machine_name):
    """
    Runs forever. Sends the process list to the server every few seconds.
    """
    # Wait a moment after startup before first send
    time.sleep(5)
    while True:
        try:
            processes = get_process_list()
            post(server_url, 'processes.php', {
                'action':       'update',
                'machine_name': machine_name,
                'processes':    processes,
            })
        except Exception as e:
            client_log(server_url, 'WARNING', f'Process send failed: {e}')
        time.sleep(PROCESS_SEND_INTERVAL)


def kill_process(pid):
    """
    Kills a process by PID.
    Called when the dashboard sends a kill command.
    """
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        # Wait up to 3 seconds for it to end
        proc.wait(timeout=3)
        log.info(f'Process {pid} terminated')
        return True
    except psutil.NoSuchProcess:
        log.warning(f'Process {pid} not found')
        return False
    except psutil.AccessDenied:
        log.warning(f'Access denied killing process {pid}')
        return False
    except Exception as e:
        log.error(f'Error killing process {pid}: {e}')
        return False

def restart_application(exe_path):
    """
    Kills all running instances of the given executable, waits briefly,
    then relaunches it from the same path.
    """
    if not exe_path or not os.path.isfile(exe_path):
        log.error(f'Restart app failed: invalid exe path "{exe_path}"')
        return False

    try:
        exe_name = os.path.basename(exe_path)
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if proc.info['name'].lower() == exe_name.lower():
                    psutil.Process(proc.info['pid']).terminate()
            except psutil.AccessDenied:
                log.warning(f'Access denied terminating PID {proc.info["pid"]} — may need to run client as Administrator')
                return False
            except psutil.NoSuchProcess:
                continue  # already closed, fine

        time.sleep(2)

        subprocess.Popen([exe_path])
        return True
    except Exception as e:
        log.error(f'Restart app failed for {exe_path}: {e}')
        return False
        
# ── Screenshot functions ────────────────────────────────────────────────────────
def take_screenshot(server_url, machine_name):
    """
    Takes a screenshot of the current screen and sends it to the server.
    Only works if Pillow is installed (pip install pillow).
    """
    if not SCREENSHOT_AVAILABLE:
        client_log(server_url, 'WARNING', 'Screenshot not available — install Pillow: pip install pillow')
        return

    try:
        # Capture the screen
        screenshot = ImageGrab.grab(all_screens=True)

        # Resize to reduce file size (max 1280px wide)
        max_width = 1280
        if screenshot.width > max_width:
            ratio  = max_width / screenshot.width
            height = int(screenshot.height * ratio)
            screenshot = screenshot.resize((max_width, height))

        # Convert to base64 PNG
        buffer = io.BytesIO()
        screenshot.save(buffer, format='PNG', optimize=True)
        buffer.seek(0)
        image_base64 = 'data:image/png;base64,' + base64.b64encode(buffer.read()).decode('utf-8')

        # Send to server
        post(server_url, 'screenshot.php', {
            'machine_name': machine_name,
            'image':        image_base64,
        })
        client_log(server_url, 'INFO', 'Screenshot sent to server')

    except Exception as e:
        client_log(server_url, 'ERROR', f'Screenshot failed: {e}')


# ── Windows event log functions ─────────────────────────────────────────────────
def get_event_logs():
    """
    Reads recent Error and Warning entries from the Windows System event log.
    Returns up to 50 recent entries.
    Only works on Windows with pywin32 installed.
    """
    if not EVENTLOG_AVAILABLE:
        return []

    entries = []
    try:
        hand   = win32evtlog.OpenEventLog(None, 'System')
        flags  = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
        events = win32evtlog.ReadEventLog(hand, flags, 0)

        for event in events:
            # Only include Errors (1) and Warnings (2)
            if event.EventType not in (1, 2):
                continue

            level = 'Error' if event.EventType == 1 else 'Warning'
            entries.append({
                'level':   level,
                'source':  str(event.SourceName),
                'time':    str(event.TimeGenerated),
                'message': str(event.StringInserts[0]) if event.StringInserts else 'No details',
            })

            if len(entries) >= 50:
                break

        win32evtlog.CloseEventLog(hand)

    except Exception as e:
        log.warning(f'Event log read failed: {e}')

    return entries


def eventlog_send_loop(server_url, machine_name):
    """
    Runs forever. Sends Windows event logs to the server periodically.
    """
    time.sleep(10)  # Wait before first send
    while True:
        try:
            logs = get_event_logs()
            if logs:
                post(server_url, 'eventlogs.php', {
                    'machine_name': machine_name,
                    'logs':         logs,
                })
        except Exception as e:
            client_log(server_url, 'WARNING', f'Event log send failed: {e}')
        time.sleep(EVENTLOG_SEND_INTERVAL)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    SERVER_URL = get_server_url()
    log.info(f'Pisonet Client starting — server: {SERVER_URL}')
    log.info(f'Mode: {"Diskless" if LOG_TO_SERVER else "Normal"} logging, '
             f'{"Server" if COIN_FROM_SERVER else "File"} coin trigger')

    # Step 1: Register — now returns config AND the server that worked
    config, SERVER_URL   = register(SERVER_URL)  # ← update SERVER_URL to whichever worked
    MACHINE_NAME         = config['machine_name']
    PESOS_PER_MINUTE     = float(config.get('pesos_per_minute', 5.0))

    client_log(SERVER_URL, 'INFO', f'Running as {MACHINE_NAME} — rate: P{PESOS_PER_MINUTE}/min')

    # Step 2: Start background threads (same as before)
    threading.Thread(target=heartbeat_loop,     args=(SERVER_URL, MACHINE_NAME), daemon=True, name='heartbeat').start()
    threading.Thread(target=command_poll_loop,  args=(SERVER_URL, MACHINE_NAME), daemon=True, name='commands').start()
    threading.Thread(target=session_timer_loop, args=(SERVER_URL, MACHINE_NAME), daemon=True, name='timer').start()
    threading.Thread(target=process_send_loop,  args=(SERVER_URL, MACHINE_NAME), daemon=True, name='processes').start()
    threading.Thread(target=eventlog_send_loop, args=(SERVER_URL, MACHINE_NAME), daemon=True, name='eventlogs').start()

    if not COIN_FROM_SERVER:
        threading.Thread(target=file_coin_watcher, args=(SERVER_URL, MACHINE_NAME), daemon=True, name='coin_watcher').start()

    client_log(SERVER_URL, 'INFO', 'All threads started')

    # Step 3: Create the countdown overlay and run it on the main thread
    # (tkinter must run on main thread — this replaces the old sleep loop)
    try:
        create_overlay()
        overlay_root.mainloop()
    except KeyboardInterrupt:
        client_log(SERVER_URL, 'INFO', 'Client stopped.')
        print('Pisonet Client stopped.')


# ── Configuration Summary ──────────────────────────────────────────────────────
#
#  NORMAL SETUP (default):
#    LOG_TO_SERVER    = False  → logs go to pisonet_client.log file
#    COIN_FROM_SERVER = False  → coins triggered by insert_coin.txt file
#
#  DISKLESS SETUP:
#    LOG_TO_SERVER    = True   → logs sent to server database via clientlog.php
#    COIN_FROM_SERVER = True   → coins triggered by server via command (coin:5)
#
#  HYBRID (both work at same time):
#    LOG_TO_SERVER    = True   → logs go to both server AND local file
#    COIN_FROM_SERVER = False  → still use local file trigger
#
#  Build command (run in client folder):
#    pyinstaller --onefile --noconsole client.py
