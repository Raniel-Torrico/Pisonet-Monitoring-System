<?php
// machines.php
// DELETE a machine from the dashboard (admin only)
// Only allows deleting offline machines

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$logged_in = require_admin($conn);

$body   = get_body();
$action = trim($body['action'] ?? '');

// -- Hide machine (keeps history) --
if ($action === 'hide') {
    $name = trim($body['machine_name'] ?? '');
    if (empty($name)) respond(false, null, 'machine_name is required', 422);

    $rows = db_select($conn, 'SELECT name, status FROM machines WHERE name = ? LIMIT 1', 's', [$name]);
    if (empty($rows)) respond(false, null, 'Machine not found', 404);
    if ($rows[0]['status'] === 'online') respond(false, null, 'Cannot hide an online machine', 422);

    db_execute($conn, 'UPDATE machines SET hidden = 1 WHERE name = ?', 's', [$name]);

    db_execute($conn, 'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)', 'ssss',
        [$logged_in['username'], 'hide_machine', $name, 'Machine hidden from dashboard']);

    respond(true, null, 'Machine hidden');
}

// -- Full delete (removes all history) --
if ($action === 'delete') {
    $name = trim($body['machine_name'] ?? '');
    if (empty($name)) respond(false, null, 'machine_name is required', 422);

    $rows = db_select($conn, 'SELECT name, status FROM machines WHERE name = ? LIMIT 1', 's', [$name]);
    if (empty($rows)) respond(false, null, 'Machine not found', 404);
    if ($rows[0]['status'] === 'online') respond(false, null, 'Cannot delete an online machine', 422);

    // Delete all related data
    db_execute($conn, 'DELETE FROM sessions       WHERE machine_name = ?', 's', [$name]);
    db_execute($conn, 'DELETE FROM alerts         WHERE machine_name = ?', 's', [$name]);
    db_execute($conn, 'DELETE FROM metrics        WHERE machine_name = ?', 's', [$name]);
    db_execute($conn, 'DELETE FROM commands       WHERE machine_name = ?', 's', [$name]);
    db_execute($conn, 'DELETE FROM screenshots    WHERE machine_name = ?', 's', [$name]);
    db_execute($conn, 'DELETE FROM process_snapshots WHERE machine_name = ?', 's', [$name]);
    db_execute($conn, 'DELETE FROM event_logs     WHERE machine_name = ?', 's', [$name]);
    db_execute($conn, 'DELETE FROM machines       WHERE name = ?',         's', [$name]);

    db_execute($conn, 'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)', 'ssss',
        [$logged_in['username'], 'delete_machine', $name, 'Machine permanently deleted']);

    respond(true, null, 'Machine deleted');
}

respond(false, null, 'action must be: hide or delete', 422);