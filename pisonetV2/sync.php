<?php
// sync.php
// One-way sync from local XAMPP to Hostinger cloud.
// Safe to run multiple times — will not create duplicates.
//
// Run manually: http://localhost/pisonetV2/sync.php
// Auto-sync:    Windows Task Scheduler → curl http://localhost/pisonetV2/sync.php

// -- Cloud DB credentials (Hostinger) --
define('CLOUD_HOST', 'auth-db1409.hstgr.io'); // your Hostinger MySQL host
define('CLOUD_USER', 'u849456769_pisonet_user');
define('CLOUD_PASS', 'PisonetMonitoring@123');
define('CLOUD_NAME', 'u849456769_pisonet_db');

// -- Local DB credentials (XAMPP) --
define('LOCAL_HOST', 'localhost');
define('LOCAL_USER', 'root');
define('LOCAL_PASS', '');
define('LOCAL_NAME', 'pisonet_db');

define('SYNC_KEY', 'pisonet123');

// Security check — only localhost or correct key
$request_key = $_GET['key'] ?? '';
$is_local    = in_array($_SERVER['REMOTE_ADDR'], ['127.0.0.1', '::1']);
if (!$is_local && $request_key !== SYNC_KEY) {
    http_response_code(401);
    die(json_encode(['success' => false, 'message' => 'Unauthorized']));
}

header('Content-Type: application/json');
$start_time = microtime(true);
$results    = [];

// Connect to local
$local = new mysqli(LOCAL_HOST, LOCAL_USER, LOCAL_PASS, LOCAL_NAME);
if ($local->connect_error) {
    die(json_encode(['success' => false, 'message' => 'Local DB error: ' . $local->connect_error]));
}
$local->set_charset('utf8mb4');

// Connect to cloud
$cloud = new mysqli(CLOUD_HOST, CLOUD_USER, CLOUD_PASS, CLOUD_NAME);
if ($cloud->connect_error) {
    die(json_encode(['success' => false, 'message' => 'Cloud DB error: ' . $cloud->connect_error]));
}
$cloud->set_charset('utf8mb4');

// -- Sync machines --
// Uses mac as unique key to prevent duplicates
function sync_machines(mysqli $local, mysqli $cloud): array {
    $updated = 0;

    $result = $local->query("SELECT * FROM machines");
    if (!$result) return ['error' => $local->error];

    while ($row = $result->fetch_assoc()) {
        $name    = $cloud->real_escape_string($row['name']);
        $mac     = $cloud->real_escape_string($row['mac'] ?? '');
        $status  = $cloud->real_escape_string($row['status']);
        $cpu     = (float) $row['cpu'];
        $ram     = (float) $row['ram'];
        $disk    = (float) $row['disk'];
        $ppm     = (float) $row['pesos_per_minute'];
        $last    = $row['last_seen']  ? "'" . $cloud->real_escape_string($row['last_seen'])  . "'" : 'NULL';
        $created = $cloud->real_escape_string($row['created_at']);

        $sql = "INSERT INTO machines (name, mac, status, cpu, ram, disk, pesos_per_minute, last_seen, created_at)
                VALUES ('$name', '$mac', '$status', $cpu, $ram, $disk, $ppm, $last, '$created')
                ON DUPLICATE KEY UPDATE
                    name      = '$name',
                    status    = '$status',
                    cpu       = $cpu,
                    ram       = $ram,
                    disk      = $disk,
                    last_seen = $last";

        if ($cloud->query($sql)) $updated++;
    }

    return ['updated' => $updated];
}

// -- Sync sessions --
// Only syncs rows that don't exist on cloud yet (by id)
function sync_sessions(mysqli $local, mysqli $cloud): array {
    $copied = 0;

    // Get highest id already on cloud
    $res     = $cloud->query("SELECT COALESCE(MAX(id), 0) AS max_id FROM sessions");
    $max_id  = (int) $res->fetch_assoc()['max_id'];

    // Only get rows newer than what cloud already has
    $result = $local->query("SELECT * FROM sessions WHERE id > $max_id ORDER BY id ASC");
    if (!$result) return ['error' => $local->error];

    while ($row = $result->fetch_assoc()) {
        $id       = (int) $row['id'];
        $machine  = $cloud->real_escape_string($row['machine_name']);
        $pesos    = (float) $row['pesos'];
        $started  = $cloud->real_escape_string($row['started_at']);
        $ended    = $row['ended_at']    ? "'" . $cloud->real_escape_string($row['ended_at']) . "'"    : 'NULL';
        $duration = $row['duration_min'] !== null ? (int) $row['duration_min'] : 'NULL';

        $sql = "INSERT IGNORE INTO sessions (id, machine_name, pesos, started_at, ended_at, duration_min)
                VALUES ($id, '$machine', $pesos, '$started', $ended, $duration)";

        if ($cloud->query($sql) && $cloud->affected_rows > 0) $copied++;
    }

    return ['copied' => $copied];
}

// -- Sync alerts --
function sync_alerts(mysqli $local, mysqli $cloud): array {
    $copied = 0;

    $res    = $cloud->query("SELECT COALESCE(MAX(id), 0) AS max_id FROM alerts");
    $max_id = (int) $res->fetch_assoc()['max_id'];

    $result = $local->query("SELECT * FROM alerts WHERE id > $max_id ORDER BY id ASC");
    if (!$result) return ['error' => $local->error];

    while ($row = $result->fetch_assoc()) {
        $id       = (int) $row['id'];
        $machine  = $cloud->real_escape_string($row['machine_name']);
        $type     = $cloud->real_escape_string($row['type']);
        $message  = $cloud->real_escape_string($row['message']);
        $resolved = (int) $row['resolved'];
        $created  = $cloud->real_escape_string($row['created_at']);

        $sql = "INSERT IGNORE INTO alerts (id, machine_name, type, message, resolved, created_at)
                VALUES ($id, '$machine', '$type', '$message', $resolved, '$created')";

        if ($cloud->query($sql) && $cloud->affected_rows > 0) $copied++;
    }

    return ['copied' => $copied];
}

// -- Sync logs --
function sync_logs(mysqli $local, mysqli $cloud): array {
    $copied = 0;

    $res    = $cloud->query("SELECT COALESCE(MAX(id), 0) AS max_id FROM logs");
    $max_id = (int) $res->fetch_assoc()['max_id'];

    $result = $local->query("SELECT * FROM logs WHERE id > $max_id ORDER BY id ASC LIMIT 500");
    if (!$result) return ['error' => $local->error];

    while ($row = $result->fetch_assoc()) {
        $id      = (int) $row['id'];
        $actor   = $cloud->real_escape_string($row['actor']);
        $action  = $cloud->real_escape_string($row['action']);
        $target  = $cloud->real_escape_string($row['target']);
        $detail  = $cloud->real_escape_string($row['detail']);
        $created = $cloud->real_escape_string($row['created_at']);

        $sql = "INSERT IGNORE INTO logs (id, actor, action, target, detail, created_at)
                VALUES ($id, '$actor', '$action', '$target', '$detail', '$created')";

        if ($cloud->query($sql) && $cloud->affected_rows > 0) $copied++;
    }

    return ['copied' => $copied];
}

// -- Sync admins --
// Only syncs accounts that don't exist on cloud yet
function sync_admins(mysqli $local, mysqli $cloud): array {
    $copied = 0;

    $result = $local->query("SELECT id, username, password, role, created_at FROM admins");
    if (!$result) return ['error' => $local->error];

    while ($row = $result->fetch_assoc()) {
        $id       = (int) $row['id'];
        $username = $cloud->real_escape_string($row['username']);
        $password = $cloud->real_escape_string($row['password']);
        $role     = $cloud->real_escape_string($row['role']);
        $created  = $cloud->real_escape_string($row['created_at']);

        $sql = "INSERT IGNORE INTO admins (id, username, password, role, created_at)
                VALUES ($id, '$username', '$password', '$role', '$created')";

        if ($cloud->query($sql) && $cloud->affected_rows > 0) $copied++;
    }

    return ['copied' => $copied];
}

// -- Run all syncs --
$results['machines'] = sync_machines($local, $cloud);
$results['sessions'] = sync_sessions($local, $cloud);
$results['alerts']   = sync_alerts($local, $cloud);
$results['logs']     = sync_logs($local, $cloud);
$results['admins']   = sync_admins($local, $cloud);

$elapsed = round(microtime(true) - $start_time, 2);

echo json_encode([
    'success'   => true,
    'message'   => "Sync complete in {$elapsed}s",
    'synced_at' => date('Y-m-d H:i:s'),
    'results'   => $results,
], JSON_PRETTY_PRINT);

$local->close();
$cloud->close();
