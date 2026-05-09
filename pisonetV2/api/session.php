<?php
// session.php
// Called by the Python client when a session starts or ends.
// A session starts when coins are inserted, ends when time runs out.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$body   = get_body();
$action = trim($body['action'] ?? '');

// -- Start a session --
if ($action === 'start') {
    $machine_name = trim($body['machine_name'] ?? '');
    $pesos        = isset($body['pesos']) ? (float) $body['pesos'] : null;

    if (empty($machine_name))       respond(false, null, 'machine_name is required', 422);
    if ($pesos === null || $pesos <= 0) respond(false, null, 'pesos must be greater than 0', 422);

    $rows = db_select($conn, 'SELECT id FROM machines WHERE name = ? LIMIT 1', 's', [$machine_name]);
    if (empty($rows)) respond(false, null, 'Machine not found', 404);

    // Close any open session first (just in case)
    db_execute(
        $conn,
        'UPDATE sessions SET ended_at = NOW(),
         duration_min = TIMESTAMPDIFF(MINUTE, started_at, NOW())
         WHERE machine_name = ? AND ended_at IS NULL',
        's',
        [$machine_name]
    );

    $session_id = db_execute(
        $conn,
        'INSERT INTO sessions (machine_name, pesos) VALUES (?, ?)',
        'sd',
        [$machine_name, $pesos]
    );

    db_execute($conn, 'UPDATE machines SET status = "online" WHERE name = ?', 's', [$machine_name]);

    respond(true, ['session_id' => (int) $session_id], 'Session started');
}

// -- End a session --
if ($action === 'end') {
    $machine_name = trim($body['machine_name'] ?? '');
    if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);

    $rows = db_select(
        $conn,
        'SELECT id FROM sessions WHERE machine_name = ? AND ended_at IS NULL
         ORDER BY started_at DESC LIMIT 1',
        's',
        [$machine_name]
    );

    if (empty($rows)) respond(false, null, 'No active session found', 404);

    $session_id = (int) $rows[0]['id'];

    db_execute(
        $conn,
        'UPDATE sessions SET ended_at = NOW(),
         duration_min = TIMESTAMPDIFF(MINUTE, started_at, NOW())
         WHERE id = ?',
        'i',
        [$session_id]
    );

    db_execute($conn, 'UPDATE machines SET status = "idle" WHERE name = ?', 's', [$machine_name]);

    respond(true, ['session_id' => $session_id], 'Session ended');
}

respond(false, null, 'action must be: start or end', 422);
