<?php
// processes.php
// GET  - returns the latest process list for a machine
// POST - stores a process list sent by the client (action: update)
//      - queues a kill command for a specific process (action: kill)

require_once __DIR__ . '/../db/config.php';

validate_api_key();

// -- GET: return process list for a machine --
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $machine_name = trim($_GET['machine_name'] ?? '');
    if (empty($machine_name)) {
        respond(false, null, 'machine_name is required', 422);
    }

    $rows = db_select(
        $conn,
        'SELECT processes, recorded_at
         FROM process_snapshots
         WHERE machine_name = ?
         ORDER BY recorded_at DESC
         LIMIT 1',
        's',
        [$machine_name]
    );

    if (empty($rows)) {
        respond(true, ['processes' => [], 'recorded_at' => null], 'No data yet');
    }

    $processes = json_decode($rows[0]['processes'], true) ?? [];
    respond(true, [
        'processes'   => $processes,
        'recorded_at' => $rows[0]['recorded_at'],
    ], 'OK');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

$body   = get_body();
$action = trim($body['action'] ?? '');

// -- Store process list sent by client --
if ($action === 'update') {
    $machine_name = trim($body['machine_name'] ?? '');
    $processes    = $body['processes'] ?? [];

    if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
    if (!is_array($processes)) respond(false, null, 'processes must be an array', 422);

    db_execute(
        $conn,
        'INSERT INTO process_snapshots (machine_name, processes, recorded_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE processes = VALUES(processes), recorded_at = NOW()',
        'ss',
        [$machine_name, json_encode($processes)]
    );

    respond(true, null, 'Process list updated');
}

// -- Queue a kill command for a specific process --
if ($action === 'kill') {
    $machine_name = trim($body['machine_name'] ?? '');
    $pid          = isset($body['pid']) ? (int) $body['pid'] : 0;
    $process_name = trim($body['process_name'] ?? '');

    if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
    if ($pid <= 0)             respond(false, null, 'pid must be a positive number', 422);

    // Queue as a command so the client picks it up
    $command = "kill:{$pid}";
    $id = db_execute(
        $conn,
        'INSERT INTO commands (machine_name, command, issued_by) VALUES (?, ?, ?)',
        'sss',
        [$machine_name, $command, 'admin']
    );

    db_execute(
        $conn,
        'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
        'ssss',
        ['admin', 'kill_process', $machine_name, "PID: {$pid} ({$process_name})"]
    );

    respond(true, ['id' => (int) $id], 'Kill command queued');
}

respond(false, null, 'action must be: update or kill', 422);
