# ── Standalone Coin Acceptor Tester ─────────────────────────────────────────────
# Run this to verify the ESP32 -> PC serial communication and coin detection
# without touching any billing/session logic.
#
# Expected ESP32 output format: "Pulses: 4 -> Pesos: 5"
# Update COIN_SERIAL_PORT below to match your ESP32 COM port.

import serial
import time
import sys
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────────
COIN_SERIAL_PORT = 'COM9'   # <-- change to your ESP32 COM port
COIN_SERIAL_BAUD = 9600

# Expected pulse-to-peso mapping (for reference / sanity check)
EXPECTED_MAP = {
    1: 1,
    4: 5,
    7: 10,
    14: 20,
}

# ── Helpers ─────────────────────────────────────────────────────────────────────
def ts():
    return datetime.now().strftime('%H:%M:%S.%f')[:-3]

def log(msg):
    print(f"[{ts()}] {msg}")

# ── Main ────────────────────────────────────────────────────────────────────────
def main():
    log(f"Opening serial port {COIN_SERIAL_PORT} @ {COIN_SERIAL_BAUD} baud...")
    try:
        ser = serial.Serial(COIN_SERIAL_PORT, COIN_SERIAL_BAUD, timeout=1)
    except Exception as e:
        log(f"FATAL: cannot open port: {e}")
        log("Check: correct COM port? ESP32 plugged in? drivers installed?")
        log("Tip: on Windows, check Device Manager -> Ports (COM & LPT)")
        sys.exit(1)

    log(f"OK — listening on {COIN_SERIAL_PORT}. Insert coins now. Ctrl+C to quit.")
    print("-" * 70)

    total_pesos = 0.0
    coin_count = 0
    raw_count = 0

    try:
        while True:
            try:
                raw = ser.readline()
            except serial.SerialException as e:
                log(f"Serial error: {e} — exiting")
                break

            if not raw:
                continue

            raw_count += 1

            # Show EVERYTHING the ESP32 sends, including garbage, so we can
            # tell whether the ESP32 is talking at all vs. format mismatch.
            try:
                line = raw.decode(errors='ignore').strip()
            except Exception:
                line = repr(raw)

            if not line:
                continue

            log(f"RAW: {line!r}")

            # Try to parse the expected format
            if '->' in line and 'Pesos:' in line:
                try:
                    pesos_str = line.split('Pesos:')[-1].strip()
                    pesos = float(pesos_str)
                except ValueError:
                    log("  -> could not parse peso value, skipping")
                    continue

                if pesos > 0:
                    coin_count += 1
                    total_pesos += pesos
                    log(f"  ✅ COIN DETECTED: P{pesos}  "
                        f"(count={coin_count}, total=P{total_pesos})")

                    # Sanity check against expected mapping
                    if 'Pulses:' in line:
                        try:
                            pulses_str = line.split('Pulses:')[1].split('->')[0].strip()
                            pulses = int(pulses_str)
                            expected = EXPECTED_MAP.get(pulses)
                            if expected is None:
                                log(f"  ⚠️  unexpected pulse count {pulses} "
                                    f"(expected one of {list(EXPECTED_MAP.keys())})")
                            elif expected != pesos:
                                log(f"  ⚠️  MAPPING MISMATCH: {pulses} pulses "
                                    f"expected P{expected}, got P{pesos}")
                        except Exception:
                            pass
            else:
                log("  (line does not match 'Pulses: N -> Pesos: M' format)")

    except KeyboardInterrupt:
        print()
        log("Stopped by user.")
    finally:
        try:
            ser.close()
        except Exception:
            pass
        print("-" * 70)
        log(f"Summary: {coin_count} coin(s) detected, total P{total_pesos}, "
            f"{raw_count} raw serial lines received")

if __name__ == '__main__':
    main()