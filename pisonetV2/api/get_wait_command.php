<?php
// get_wake_commands.php
// Called by wake_watcher.py running on the always-on local server PC.
// Returns ALL pending wake commands (not tied to one machine),
// since a powered-off PC cannot poll for its own commands.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

// Join with machines table to get the MAC address needed for the magic packet
$rows = db_select(
    $conn,
    'SELECT c.id, c.machine_name, m.mac
     FROM commands c
     JOIN machines m ON m.name = c.machine_name
     WHERE c.command = "wake" AND c.status = "pending"
     ORDER BY c.issued_at ASC'
);

respond(true, ['commands' => $rows], 'OK');