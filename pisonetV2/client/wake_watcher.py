"""
Wake Watcher
Runs on the always-on server PC (the one with XAMPP).
Polls the API for pending "wake" commands and sends
Wake-on-LAN magic packets on the local network.

How to run:
    python wake_watcher.py

To run silently in background on Windows, compile with PyInstaller:
    pyinstaller --onefile --noconsole wake_watcher.py
"""

import socket
import time
import requests
import logging

# ── Settings ───────────────────────────────────────────────────────────────────
API_URL       = 'https://monitonet.com/pisonetV2/api'  # cloud, since dashboard queues here
API_KEY       = 'pisonet123'
POLL_INTERVAL = 5  # seconds between checks

HEADERS = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
}

logging.basicConfig(
    filename='wake_watcher.log',
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)


def send_magic_packet(mac_address):
    """
    Builds and sends a Wake-on-LAN magic packet.
    Magic packet format: 6 bytes of 0xFF followed by the
    target MAC address repeated 16 times.
    """
    mac_clean = mac_address.replace(':', '').replace('-', '')

    if len(mac_clean) != 12:
        log.warning(f'Invalid MAC address: {mac_address}')
        return False

    # Build the magic packet
    data = bytes.fromhex('FF' * 6 + mac_clean * 16)

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(data, ('255.255.255.255', 9))  # broadcast on port 9
        sock.close()
        return True
    except Exception as e:
        log.error(f'Failed to send magic packet: {e}')
        return False


def acknowledge_command(command_id):
    """Marks the wake command as executed so it doesn't get picked up again."""
    try:
        requests.post(
            f'{API_URL}/command.php',
            json={'action': 'ack', 'id': command_id, 'status': 'executed'},
            headers=HEADERS,
            timeout=5,
        )
    except Exception as e:
        log.warning(f'Failed to ack command {command_id}: {e}')


def poll_loop():
    log.info('Wake Watcher started — polling for wake commands')
    print('Wake Watcher running. Press Ctrl+C to stop.')

    while True:
        try:
            resp = requests.get(
                f'{API_URL}/get_wake_commands.php',
                headers=HEADERS,
                timeout=5,
            )
            result = resp.json()

            if result.get('success'):
                commands = result.get('data', {}).get('commands', [])

                for cmd in commands:
                    machine_name = cmd['machine_name']
                    mac          = cmd['mac']
                    cmd_id       = cmd['id']

                    log.info(f'Waking {machine_name} ({mac})')
                    print(f'Sending wake packet to {machine_name} ({mac})')

                    success = send_magic_packet(mac)
                    if success:
                        acknowledge_command(cmd_id)
                        log.info(f'Wake packet sent successfully to {machine_name}')
                    else:
                        log.warning(f'Failed to send wake packet to {machine_name}')

        except requests.exceptions.ConnectionError:
            log.warning('Cannot reach API server — will retry')
        except Exception as e:
            log.error(f'Unexpected error: {e}')

        time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    try:
        poll_loop()
    except KeyboardInterrupt:
        log.info('Wake Watcher stopped.')
        print('Wake Watcher stopped.')