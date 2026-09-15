<?php
// specs.php
// POST — client sends hardware specs (on registration or manual refresh)
// Called separately from heartbeat since specs rarely change

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$body         = get_body();
$machine_name = trim($body['machine_name'] ?? '');

if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);

$rows = db_select($conn, 'SELECT id FROM machines WHERE name = ? LIMIT 1', 's', [$machine_name]);
if (empty($rows)) respond(false, null, 'Machine not found', 404);

db_execute(
    $conn,
    'UPDATE machines SET
        ip_address = ?, cpu_model = ?, cpu_cores = ?, total_ram = ?,
        total_disk = ?, free_disk = ?, os = ?, win_user = ?,
        system_model = ?, client_version = ?, specs_updated_at = NOW()
     WHERE name = ?',
    'ssidddsssss',
    [
        trim($body['ip_address']     ?? ''),
        trim($body['cpu_model']      ?? ''),
        (int)   ($body['cpu_cores']     ?? 0),
        (float) ($body['total_ram']     ?? 0),
        (float) ($body['total_disk']    ?? 0),
        (float) ($body['free_disk']     ?? 0),
        trim($body['os_info']        ?? ''),
        trim($body['win_user']       ?? ''),
        trim($body['system_model']   ?? ''),
        trim($body['client_version'] ?? ''),
        $machine_name,
    ]
);

respond(true, null, 'Specs updated');