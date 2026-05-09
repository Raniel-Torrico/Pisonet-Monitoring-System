<?php
// command.php
// Used for two things:
//   1. Dashboard sends a command (shutdown, restart, lock) to a machine
//   2. Python client tells the server it finished running the command

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$body   = get_body();
$action = trim($body['action'] ?? '');

// -- Queue a new command (called by dashboard) --
if ($action === 'queue') {
    $machine_name = trim($body['machine_name'] ?? '');
    $command      = trim($body['command']      ?? '');
    $issued_by    = trim($body['issued_by']    ?? 'admin');

    if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
    if (empty($command))      respond(false, null, 'command is required', 422);

    $allowed = ['shutdown', 'restart', 'lock', 'unlock'];
    if (!in_array($command, $allowed, true)) {
        respond(false, null, 'command must be: shutdown, restart, lock, or unlock', 422);
    }

    // Check if machine exists
    $rows = db_select($conn, 'SELECT id FROM machines WHERE name = ? LIMIT 1', 's', [$machine_name]);
    if (empty($rows)) respond(false, null, 'Machine not found', 404);

    $id = db_execute(
        $conn,
        'INSERT INTO commands (machine_name, command, issued_by) VALUES (?, ?, ?)',
        'sss',
        [$machine_name, $command, $issued_by]
    );

    // Save to logs
    db_execute(
        $conn,
        'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
        'ssss',
        [$issued_by, $command, $machine_name, "Command queued (id: $id)"]
    );

    respond(true, ['id' => (int) $id], 'Command queued');
}

// -- Acknowledge a command (called by Python client after running it) --
if ($action === 'ack') {
    $id     = isset($body['id']) ? (int) $body['id'] : 0;
    $status = trim($body['status'] ?? '');

    if ($id <= 0) respond(false, null, 'id must be a positive number', 422);

    $allowed = ['executed', 'failed'];
    if (!in_array($status, $allowed, true)) {
        respond(false, null, 'status must be: executed or failed', 422);
    }

    $rows = db_select($conn, 'SELECT id FROM commands WHERE id = ? LIMIT 1', 'i', [$id]);
    if (empty($rows)) respond(false, null, 'Command not found', 404);

    db_execute(
        $conn,
        'UPDATE commands SET status = ?, executed_at = NOW() WHERE id = ?',
        'si',
        [$status, $id]
    );

    respond(true, null, "Command marked as $status");
}

respond(false, null, 'action must be: queue or ack', 422);
