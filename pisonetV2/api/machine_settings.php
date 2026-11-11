<?php
// machine_settings.php
// Allows admin to update a machine's pesos_per_minute rate.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();
$logged_in = require_admin($conn); // only admins can change rates

$body             = get_body();
$machine_name     = trim($body['machine_name'] ?? '');
$pesos_per_minute = isset($body['pesos_per_minute']) ? (float) $body['pesos_per_minute'] : null;

if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
if ($pesos_per_minute === null || $pesos_per_minute <= 0) {
    respond(false, null, 'pesos_per_minute must be greater than 0', 422);
}

$rows = db_select($conn, 'SELECT id FROM machines WHERE name = ? LIMIT 1', 's', [$machine_name]);
if (empty($rows)) respond(false, null, 'Machine not found', 404);

db_execute(
    $conn,
    'UPDATE machines SET pesos_per_minute = ? WHERE name = ?',
    'ds',
    [$pesos_per_minute, $machine_name]
);

db_execute(
    $conn,
    'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
    'ssss',
    [$logged_in['username'], 'update_rate', $machine_name, "Rate changed to {$pesos_per_minute} min/peso"]
);

respond(true, null, 'Rate updated');