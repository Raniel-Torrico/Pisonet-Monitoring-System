<?php
// eventlogs.php
// POST - receives Windows event logs from the client
// GET  - returns the latest event logs for a machine

require_once __DIR__ . '/../db/config.php';

validate_api_key();

// -- GET: return latest event logs for a machine --
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $machine_name = trim($_GET['machine_name'] ?? '');
    if (empty($machine_name)) {
        respond(false, null, 'machine_name is required', 422);
    }

    $rows = db_select(
        $conn,
        'SELECT logs_data, recorded_at
         FROM event_logs
         WHERE machine_name = ?
         ORDER BY recorded_at DESC
         LIMIT 1',
        's',
        [$machine_name]
    );

    if (empty($rows)) {
        respond(true, ['logs' => [], 'recorded_at' => null], 'No event logs yet');
    }

    $logs = json_decode($rows[0]['logs_data'], true) ?? [];
    respond(true, [
        'logs'        => $logs,
        'recorded_at' => $rows[0]['recorded_at'],
    ], 'OK');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

$body         = get_body();
$machine_name = trim($body['machine_name'] ?? '');
$logs         = $body['logs'] ?? [];

if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
if (!is_array($logs))     respond(false, null, 'logs must be an array', 422);

// Keep only the latest snapshot per machine
db_execute(
    $conn,
    'DELETE FROM event_logs WHERE machine_name = ?',
    's',
    [$machine_name]
);

db_execute(
    $conn,
    'INSERT INTO event_logs (machine_name, logs_data) VALUES (?, ?)',
    'ss',
    [$machine_name, json_encode($logs)]
);

respond(true, null, 'Event logs saved');
