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

    // Regular commands + coin insert for diskless mode
    // Coin commands use the format: coin:5 (meaning insert P5)
    $allowed  = ['shutdown', 'restart', 'lock', 'unlock', 'screenshot', 'wake', 'refresh_specs'];
$is_coin  = str_starts_with($command, 'coin:');
$is_kill  = str_starts_with($command, 'kill:');
$is_restart_app = str_starts_with($command, 'restart_app:');

if (!in_array($command, $allowed, true) && !$is_coin && !$is_kill && !$is_restart_app) {
    respond(false, null, 'command must be: shutdown, restart, lock, unlock, screenshot, wake, refresh_specs, coin:[amount], kill:[pid], or restart_app:[path]', 422);
}

    // Validate the coin amount if it is a coin command
    if ($is_coin) {
        $amount = (float) substr($command, 5);
        if ($amount <= 0) {
            respond(false, null, 'Coin amount must be greater than 0', 422);
        }
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

    if (mt_rand(1, 100) === 1) {
    db_execute(
        $conn,
        'DELETE FROM commands WHERE issued_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );
}

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

$is_restart_app = str_starts_with($command, 'restart_app:');
if (!in_array($command, $allowed, true) && !$is_coin && !$is_kill && !$is_restart_app) {
    respond(false, null, 'command must be: ...', 422);
}
