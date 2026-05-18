<?php
// metrics.php
// Returns all machines and their current status.
// Also marks machines as offline if they haven't sent a heartbeat in 15 seconds.
// Creates alerts when a machine goes offline or has been idle for 10+ minutes.
// Called by the React dashboard every 3 seconds.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

// -- Find machines that just went offline --
// Check BEFORE updating so we know which ones just changed
$went_offline = db_select(
    $conn,
    'SELECT name FROM machines
     WHERE status != "offline"
     AND (last_seen IS NULL OR last_seen < DATE_SUB(NOW(), INTERVAL 15 SECOND))'
);

// Mark those machines as offline
db_execute(
    $conn,
    'UPDATE machines SET status = "offline"
     WHERE status != "offline"
     AND (last_seen IS NULL OR last_seen < DATE_SUB(NOW(), INTERVAL 15 SECOND))'
);

// Create an offline alert for each machine that just went offline
foreach ($went_offline as $machine) {
    $existing = db_select(
        $conn,
        'SELECT id FROM alerts
         WHERE machine_name = ? AND type = "offline" AND resolved = 0
         AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         LIMIT 1',
        's',
        [$machine['name']]
    );

    if (empty($existing)) {
        db_execute(
            $conn,
            'INSERT INTO alerts (machine_name, type, message) VALUES (?, "offline", ?)',
            'ss',
            [$machine['name'], "{$machine['name']} went offline"]
        );
        db_execute(
            $conn,
            'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
            'ssss',
            ['system', 'offline', $machine['name'], 'Machine stopped sending heartbeats']
        );
    }
}

// -- Idle machine detection --
// Only alert if machine is online, has had at least one session before,
// and has been idle for 10+ minutes since the last session ended.
$online_machines = db_select(
    $conn,
    'SELECT name FROM machines WHERE status = "online"'
);

foreach ($online_machines as $machine) {
    // Skip if there is an active session right now
    $active_session = db_select(
        $conn,
        'SELECT id FROM sessions WHERE machine_name = ? AND ended_at IS NULL LIMIT 1',
        's',
        [$machine['name']]
    );
    if (!empty($active_session)) continue;

    // Skip if machine has never had a session
    $has_sessions = db_select(
        $conn,
        'SELECT id FROM sessions WHERE machine_name = ? LIMIT 1',
        's',
        [$machine['name']]
    );
    if (empty($has_sessions)) continue;

    // Check how long ago the last session ended
    $last_activity = db_select(
        $conn,
        'SELECT MAX(ended_at) AS last_active
         FROM sessions
         WHERE machine_name = ? AND ended_at IS NOT NULL',
        's',
        [$machine['name']]
    );

    $last_active = $last_activity[0]['last_active'] ?? null;
    if (!$last_active) continue;

    $idle_minutes = (int) db_select(
        $conn,
        'SELECT TIMESTAMPDIFF(MINUTE, ?, NOW()) AS mins',
        's',
        [$last_active]
    )[0]['mins'];

    if ($idle_minutes >= 10) {
        $existing = db_select(
            $conn,
            'SELECT id FROM alerts
             WHERE machine_name = ? AND type = "idle" AND resolved = 0
             AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
             LIMIT 1',
            's',
            [$machine['name']]
        );

        if (empty($existing)) {
            $msg = "{$machine['name']} has been idle for {$idle_minutes} minutes";
            db_execute(
                $conn,
                'INSERT INTO alerts (machine_name, type, message) VALUES (?, "idle", ?)',
                'ss',
                [$machine['name'], $msg]
            );
            db_execute(
                $conn,
                'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
                'ssss',
                ['system', 'idle', $machine['name'], "No session for {$idle_minutes} minutes"]
            );
        }
    }
}

// -- Get all machines --
$machines = db_select(
    $conn,
    'SELECT name, mac, status, cpu, ram, disk, pesos_per_minute, last_seen, created_at
     FROM machines ORDER BY name ASC'
);

// Attach active session info to each machine
foreach ($machines as &$machine) {
    $session = db_select(
        $conn,
        'SELECT id, pesos, started_at,
         TIMESTAMPDIFF(SECOND, started_at, NOW()) AS elapsed_sec
         FROM sessions WHERE machine_name = ? AND ended_at IS NULL
         ORDER BY started_at DESC LIMIT 1',
        's',
        [$machine['name']]
    );

    if (!empty($session)) {
        $s             = $session[0];
        $total_sec     = (float) $machine['pesos_per_minute'] * 60 * (float) $s['pesos'];
        $remaining_sec = max(0, $total_sec - (int) $s['elapsed_sec']);

        $machine['session'] = [
            'id'            => (int) $s['id'],
            'pesos'         => (float) $s['pesos'],
            'started_at'    => $s['started_at'],
            'elapsed_sec'   => (int) $s['elapsed_sec'],
            'remaining_sec' => (int) $remaining_sec,
        ];
    } else {
        $machine['session'] = null;
    }

    $machine['cpu']              = (float) $machine['cpu'];
    $machine['ram']              = (float) $machine['ram'];
    $machine['disk']             = (float) $machine['disk'];
    $machine['pesos_per_minute'] = (float) $machine['pesos_per_minute'];
}
unset($machine);

// Count machines by status
$summary = [
    'total'   => count($machines),
    'online'  => count(array_filter($machines, fn($m) => $m['status'] === 'online')),
    'idle'    => count(array_filter($machines, fn($m) => $m['status'] === 'idle')),
    'offline' => count(array_filter($machines, fn($m) => $m['status'] === 'offline')),
];

respond(true, [
    'machines' => $machines,
    'summary'  => $summary,
], 'OK');