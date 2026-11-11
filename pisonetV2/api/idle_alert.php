<?php
// idle_alert.php
// Called by the Python client when nobody is using the PC during a session.
// It saves an alert so the admin can see it on the dashboard.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$body         = get_body();
$machine_name = trim($body['machine_name'] ?? '');
$type         = trim($body['type']         ?? '');
$message      = trim($body['message']      ?? '');

if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
if (empty($message))      respond(false, null, 'message is required', 422);

// only allow these two alert types
$allowed = ['idle_user', 'auto_shutdown'];
if (!in_array($type, $allowed, true)) {
    respond(false, null, 'type must be: idle_user or auto_shutdown', 422);
}

// do not make a duplicate "idle_user" alert if one is still unresolved
if ($type === 'idle_user') {
    $existing = db_select(
        $conn,
        'SELECT id FROM alerts
         WHERE machine_name = ? AND type = "idle_user" AND resolved = 0
         LIMIT 1',
        's',
        [$machine_name]
    );
    if (!empty($existing)) {
        respond(true, null, 'Alert already exists');
    }
}

db_execute(
    $conn,
    'INSERT INTO alerts (machine_name, type, message) VALUES (?, ?, ?)',
    'sss',
    [$machine_name, $type, $message]
);

// save to audit log too
db_execute(
    $conn,
    'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
    'ssss',
    ['system', $type, $machine_name, $message]
);

respond(true, null, 'Alert saved');