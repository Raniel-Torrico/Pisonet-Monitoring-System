"""
Pisonet Client
Runs in the background on each PC unit.
Registers the PC with the server, sends CPU/RAM updates,
and listens for commands like shutdown, restart, and lock.

How to build the .exe:
    1. Install required packages:
       pip install pyinstaller requests psutil

    2. Build:
       pyinstaller --onefile --noconsole client.py

    3. The .exe will be inside the dist/ folder.

    4. Place server.txt in the same folder as client.exe
       and write your server IP inside it, like:
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

import requests
import psutil


# -- Settings --
# Change DEFAULT_SERVER_URL to your server's IP address
DEFAULT_SERVER_URL    = 'http://192.168.1.7/pisonetV2/api'
API_KEY               = 'pisonet123'  # must match config.php
HEARTBEAT_INTERVAL    = 3   # how often to send CPU/RAM data (seconds)
COMMAND_POLL_INTERVAL = 2   # how often to check for new commands (seconds)


# -- Setup log file --
# Saves a log file next to the .exe so you can see what's happening
logging.basicConfig(
    filename='pisonet_client.log',
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)


# -- Headers sent with every request --
HEADERS = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
}


def get_server_url():
    """
    Reads the server URL from pisonet_client.txt if it exists.
    If the file is not found, uses DEFAULT_SERVER_URL.
    """
    exe_dir     = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else __file__)
    config_path = os.path.join(exe_dir, 'pisonet_client.txt')

    if os.path.exists(config_path):
        url = open(config_path).read().strip().rstrip('/')
        log.info(f'Server URL loaded from pisonet_client.txt: {url}')
        return url

    return DEFAULT_SERVER_URL.rstrip('/')


def get_mac():
    """
    Gets the MAC address of the Ethernet adapter.
    This is used to identify the PC so it always gets the same name.
    """
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(
                ['getmac', '/fo', 'csv', '/nh', '/v'],
                capture_output=True, text=True
            )
            for line in result.stdout.strip().split('\n'):
                parts = [p.strip().strip('"') for p in line.split(',')]
                # columns: Connection Name, Adapter Name, Physical Address, Transport
                if len(parts) >= 4:
                    conn_name = parts[0].lower()
                    mac_raw   = parts[2].replace('-', ':').lower()
                    transport = parts[3].lower()

                    # Skip disconnected adapters
                    if 'disconnected' in transport:
                        continue

                    # Prefer Ethernet
                    if 'ethernet' in conn_name:
                        log.info(f'Using Ethernet MAC: {mac_raw}')
                        return mac_raw

            # Fallback: first connected adapter
            for line in result.stdout.strip().split('\n'):
                parts = [p.strip().strip('"') for p in line.split(',')]
                if len(parts) >= 4 and 'disconnected' not in parts[3].lower():
                    mac_raw = parts[2].replace('-', ':').lower()
                    log.info(f'Using fallback MAC: {mac_raw}')
                    return mac_raw

    except Exception as e:
        log.warning(f'getmac failed: {e}')

    # Last resort fallback using Python's uuid module
    raw = uuid.UUID(int=uuid.getnode()).hex[-12:]
    return ':'.join(raw[i:i+2] for i in range(0, 12, 2))


def get_metrics():
    """Returns current CPU, RAM, disk usage and uptime."""
    return {
        'cpu':    round(psutil.cpu_percent(interval=1), 1),
        'ram':    round(psutil.virtual_memory().percent, 1),
        'disk':   round(psutil.disk_usage('/').percent, 1),
        'uptime': int(time.time() - psutil.boot_time()),
    }


def post(server_url, endpoint, payload):
    """Sends a POST request to the server. Returns the response or None on error."""
    try:
        resp = requests.post(
            f'{server_url}/{endpoint}',
            json=payload,
            headers=HEADERS,
            timeout=5,
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
    """Sends a GET request to the server. Returns the response or None on error."""
    try:
        resp = requests.get(
            f'{server_url}/{endpoint}',
            params=params,
            headers=HEADERS,
            timeout=5,
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


def register(server_url):
    """
    Registers this PC with the server using its MAC address.
    Keeps retrying every 5 seconds if the server is not reachable.
    Returns the machine config (name, pesos_per_minute).
    """
    payload = {
        'mac':      get_mac(),
        'hostname': socket.gethostname(),
    }
    log.info(f'Registering — MAC: {payload["mac"]}, hostname: {payload["hostname"]}')

    while True:
        result = post(server_url, 'register.php', payload)
        if result and result.get('success') and result.get('data'):
            config = result['data']
            log.info(f'Registered as: {config["machine_name"]}')
            return config

        log.warning('Registration failed. Retrying in 5s...')
        time.sleep(5)


def heartbeat_loop(server_url, machine_name):
    """Runs forever. Sends CPU/RAM data to the server every few seconds."""
    while True:
        metrics = get_metrics()
        metrics['machine_name'] = machine_name
        post(server_url, 'heartbeat.php', metrics)
        time.sleep(HEARTBEAT_INTERVAL)


# -- Command functions --
# These run when the dashboard sends a command to this PC

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
    # Nothing to do here — user unlocks via the login screen
    log.info('Running: unlock (no action needed)')

COMMAND_MAP = {
    'shutdown': cmd_shutdown,
    'restart':  cmd_restart,
    'lock':     cmd_lock,
    'unlock':   cmd_unlock,
}


def command_poll_loop(server_url, machine_name):
    """Runs forever. Checks for new commands from the server every few seconds."""
    while True:
        result = get(server_url, 'get_command.php', {'machine_name': machine_name})

        if result and result.get('success'):
            cmd_data = result.get('data', {})
            cmd_id   = cmd_data.get('id')
            command  = cmd_data.get('command')

            if cmd_id and command:
                if command in COMMAND_MAP:
                    # Tell the server we received it before running
                    post(server_url, 'command.php', {
                        'action': 'ack',
                        'id':     cmd_id,
                        'status': 'executed',
                    })
                    try:
                        COMMAND_MAP[command]()
                    except Exception as e:
                        log.error(f'Command "{command}" failed: {e}')
                else:
                    log.warning(f'Unknown command: {command}')

        time.sleep(COMMAND_POLL_INTERVAL)


def session_start(server_url, machine_name, pesos):
    """Call this when coins are inserted to start a session."""
    result = post(server_url, 'session.php', {
        'action':       'start',
        'machine_name': machine_name,
        'pesos':        pesos,
    })
    if result and result.get('success'):
        log.info(f'Session started — ₱{pesos}')
        return result['data']['session_id']
    return None


def session_end(server_url, machine_name):
    """Call this when the timer hits zero to end the session."""
    result = post(server_url, 'session.php', {
        'action':       'end',
        'machine_name': machine_name,
    })
    if result and result.get('success'):
        log.info('Session ended')


# -- Start the client --
if __name__ == '__main__':
    SERVER_URL = get_server_url()
    log.info(f'Pisonet Client starting — server: {SERVER_URL}')

    # Step 1: Register this PC (waits until server is reachable)
    config       = register(SERVER_URL)
    MACHINE_NAME = config['machine_name']

    # Step 2: Start background threads
    threading.Thread(target=heartbeat_loop,    args=(SERVER_URL, MACHINE_NAME), daemon=True).start()
    threading.Thread(target=command_poll_loop, args=(SERVER_URL, MACHINE_NAME), daemon=True).start()

    log.info(f'Running as {MACHINE_NAME}')

    # Step 3: Keep the program running
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        log.info('Client stopped.')
        print('Pisonet Client stopped.')
