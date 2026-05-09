<?php
// get_command.php
// Called by the Python client every 2 seconds.
// Returns the oldest pending command for that machine, or null if none.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$machine_name = trim($_GET['machine_name'] ?? '');
if (empty($machine_name)) {
    respond(false, null, 'machine_name is required', 422);
}

$rows = db_select(
    $conn,
    'SELECT id, command FROM commands
     WHERE machine_name = ? AND status = "pending"
     ORDER BY issued_at ASC LIMIT 1',
    's',
    [$machine_name]
);

if (empty($rows)) {
    respond(true, ['id' => null, 'command' => null], 'No pending commands');
}

respond(true, [
    'id'      => (int) $rows[0]['id'],
    'command' => $rows[0]['command'],
], 'Command found');
