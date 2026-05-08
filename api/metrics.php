<?php
// metrics.php
// Returns all machines and their current status.
// Also marks machines as offline if they haven't sent a heartbeat in 15 seconds.
// Creates an alert when a machine goes offline.
// Called by the React dashboard every 3 seconds.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

// Find machines that just went offline (still marked online but last_seen is too old)
// We check these BEFORE updating so we know which ones just changed
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
// Only creates one if there is no recent unresolved offline alert for that machine
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

        // Also log it
        db_execute(
            $conn,
            'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
            'ssss',
            ['system', 'offline', $machine['name'], 'Machine stopped sending heartbeats']
        );
    }
}

// Get all machines
$machines = db_select(
    $conn,
    'SELECT name, mac, status, cpu, ram, disk, pesos_per_minute, last_seen, created_at
     FROM machines ORDER BY name ASC'
);

// For each machine, check if there is an active session
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
        $s = $session[0];

        // Calculate remaining seconds: pesos x 60 seconds per peso - time already used
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

    // Make sure numbers come back as numbers not strings
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