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

    if (empty($machine_name))           respond(false, null, 'machine_name is required', 422);
    if ($pesos === null || $pesos <= 0) respond(false, null, 'pesos must be greater than 0', 422);

    // Check machine exists FIRST, before touching anything else
    $rows = db_select($conn, 'SELECT id, pesos_per_minute FROM machines WHERE name = ? LIMIT 1', 's', [$machine_name]);
    if (empty($rows)) respond(false, null, 'Machine not found', 404);

    $rate = (float) ($rows[0]['pesos_per_minute'] ?? 5.0);

    // Check the 15 hour max BEFORE inserting anything
    $max_hours     = 15;
    $total_minutes = $pesos * $rate;

    if ($total_minutes > ($max_hours * 60)) {
        respond(false, null, 'Maximum session time is 15 hours', 422);
    }

    // Close any stuck-open session first (just in case)
    db_execute(
        $conn,
        'UPDATE sessions SET ended_at = NOW(),
         duration_min = TIMESTAMPDIFF(MINUTE, started_at, NOW())
         WHERE machine_name = ? AND ended_at IS NULL',
        's',
        [$machine_name]
    );

    // Insert the new session ONCE, saving the rate used at this exact moment
    $session_id = db_execute(
        $conn,
        'INSERT INTO sessions (machine_name, pesos, rate_used) VALUES (?, ?, ?)',
        'sdd',
        [$machine_name, $pesos, $rate]
    );

    // Auto-resolve any pending idle alerts since a new session just started
    db_execute(
        $conn,
        'UPDATE alerts SET resolved = 1 WHERE machine_name = ? AND type = "idle" AND resolved = 0',
        's',
        [$machine_name]
    );

    db_execute($conn, 'UPDATE machines SET status = "online" WHERE name = ?', 's', [$machine_name]);

    respond(true, ['session_id' => (int) $session_id], 'Session started');
}

// -- Add time to an active session (stacking coins) --
if ($action === 'add_time') {
    $machine_name = trim($body['machine_name'] ?? '');
    $extra_pesos  = isset($body['pesos']) ? (float) $body['pesos'] : null;

    if (empty($machine_name))              respond(false, null, 'machine_name is required', 422);
    if ($extra_pesos === null || $extra_pesos <= 0) respond(false, null, 'pesos must be greater than 0', 422);

    $rows = db_select(
        $conn,
        'SELECT id, pesos, rate_used FROM sessions WHERE machine_name = ? AND ended_at IS NULL
         ORDER BY started_at DESC LIMIT 1',
        's',
        [$machine_name]
    );

    if (empty($rows)) respond(false, null, 'No active session found', 404);

    $session_id = (int) $rows[0]['id'];
    $rate       = (float) $rows[0]['rate_used'];

    // Enforce the same 15 hour cap on the NEW total
    $new_total_pesos   = (float) $rows[0]['pesos'] + $extra_pesos;
    $new_total_minutes = $new_total_pesos * $rate;
    $max_hours         = 15;

    if ($new_total_minutes > ($max_hours * 60)) {
        respond(false, null, 'Adding this amount would exceed the 15 hour maximum session time', 422);
    }

    db_execute(
        $conn,
        'UPDATE sessions SET pesos = pesos + ? WHERE id = ?',
        'di',
        [$extra_pesos, $session_id]
    );

    respond(true, ['session_id' => $session_id, 'total_pesos' => $new_total_pesos], 'Time added');
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
