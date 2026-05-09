<?php
// heartbeat.php
// Called every few seconds by each Python client.
// Updates the machine status and saves CPU/RAM metrics.
// Also creates alerts if CPU or RAM is too high.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$body         = get_body();
$machine_name = trim($body['machine_name'] ?? '');
$cpu          = isset($body['cpu'])    ? (float) $body['cpu']    : null;
$ram          = isset($body['ram'])    ? (float) $body['ram']    : null;
$disk         = isset($body['disk'])   ? (float) $body['disk']   : 0.0;
$uptime       = isset($body['uptime']) ? (int)   $body['uptime'] : 0;

// Validate inputs
if (empty($machine_name)) {
    respond(false, null, 'machine_name is required', 422);
}
if ($cpu === null || $cpu < 0 || $cpu > 100) {
    respond(false, null, 'cpu must be between 0 and 100', 422);
}
if ($ram === null || $ram < 0 || $ram > 100) {
    respond(false, null, 'ram must be between 0 and 100', 422);
}

// Make sure this machine is registered
$rows = db_select(
    $conn,
    'SELECT id FROM machines WHERE name = ? LIMIT 1',
    's',
    [$machine_name]
);
if (empty($rows)) {
    respond(false, null, 'Machine not found. Run register.php first.', 404);
}

// Update machine status and metrics
db_execute(
    $conn,
    'UPDATE machines SET status = "online", cpu = ?, ram = ?, disk = ?, last_seen = NOW() WHERE name = ?',
    'ddds',
    [$cpu, $ram, $disk, $machine_name]
);

// Save metrics history
db_execute(
    $conn,
    'INSERT INTO metrics (machine_name, cpu, ram, disk, uptime) VALUES (?, ?, ?, ?, ?)',
    'sdddi',
    [$machine_name, $cpu, $ram, $disk, $uptime]
);

// Create alerts if CPU or RAM is too high
// Only create a new alert if there is no recent unresolved one (within 5 minutes)
$thresholds = [
    'cpu' => ['value' => $cpu, 'limit' => 85, 'label' => 'CPU'],
    'ram' => ['value' => $ram, 'limit' => 90, 'label' => 'RAM'],
];

foreach ($thresholds as $type => $t) {
    if ($t['value'] >= $t['limit']) {
        $existing = db_select(
            $conn,
            'SELECT id FROM alerts WHERE machine_name = ? AND type = ? AND resolved = 0
             AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) LIMIT 1',
            'ss',
            [$machine_name, $type]
        );

        if (empty($existing)) {
            $msg = "{$machine_name} {$t['label']} is at {$t['value']}% (limit: {$t['limit']}%)";
            db_execute(
                $conn,
                'INSERT INTO alerts (machine_name, type, message) VALUES (?, ?, ?)',
                'sss',
                [$machine_name, $type, $msg]
            );
        }
    }
}

respond(true, null, 'Heartbeat received');
