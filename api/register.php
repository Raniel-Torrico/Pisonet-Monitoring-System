<?php
// register.php
// Called by the Python client when it starts up.
// It sends its MAC address and hostname so the server can identify it.
// If the machine is new, it gets added to the database automatically.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$body     = get_body();
$mac      = trim($body['mac']      ?? '');
$hostname = trim($body['hostname'] ?? '');

// Check if MAC is provided
if (empty($mac)) {
    respond(false, null, 'mac is required', 422);
}

// Basic MAC format check (xx:xx:xx:xx:xx:xx)
if (!preg_match('/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i', $mac)) {
    respond(false, null, 'mac format is invalid', 422);
}

// Use hostname as fallback name, clean up any weird characters
if (empty($hostname)) {
    $hostname = 'PC-UNKNOWN';
}
$hostname = preg_replace('/[^a-zA-Z0-9\-_]/', '', $hostname);
$hostname = substr($hostname, 0, 50);

// Check if this machine is already registered
$rows = db_select(
    $conn,
    'SELECT name, pesos_per_minute FROM machines WHERE mac = ? LIMIT 1',
    's',
    [$mac]
);

// Machine found, return its config
if (!empty($rows)) {
    respond(true, [
        'machine_name'     => $rows[0]['name'],
        'pesos_per_minute' => (float) $rows[0]['pesos_per_minute'],
    ], 'Machine recognized');
}

// New machine, register it
// If the hostname is already taken, add last 4 chars of MAC to make it unique
$existing = db_select(
    $conn,
    'SELECT id FROM machines WHERE name = ? LIMIT 1',
    's',
    [$hostname]
);

$name = empty($existing)
    ? $hostname
    : $hostname . '-' . strtoupper(substr(str_replace(':', '', $mac), -4));

db_execute(
    $conn,
    'INSERT INTO machines (name, mac, status) VALUES (?, ?, "offline")',
    'ss',
    [$name, $mac]
);

// Log the registration
db_execute(
    $conn,
    'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
    'ssss',
    ['system', 'register', $name, "MAC: $mac, Host: $hostname"]
);

respond(true, [
    'machine_name'     => $name,
    'pesos_per_minute' => 1.00,
], 'Machine registered');
