<?php
// machine_manage.php
// Handles archiving, restoring, and permanently deleting machines.
// Admin only.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();
$logged_in = require_admin($conn); // only admins can manage machines

$body         = get_body();
$action       = trim($body['action'] ?? '');
$machine_name = trim($body['machine_name'] ?? '');

if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);

$rows = db_select($conn, 'SELECT id FROM machines WHERE name = ? LIMIT 1', 's', [$machine_name]);
if (empty($rows)) respond(false, null, 'Machine not found', 404);

// -- Archive (soft delete, hides from dashboard but keeps data) --
if ($action === 'archive') {
    db_execute($conn, 'UPDATE machines SET archived = 1 WHERE name = ?', 's', [$machine_name]);

    db_execute(
        $conn,
        'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
        'ssss',
        [$logged_in['username'], 'archive_machine', $machine_name, 'Machine archived']
    );

    respond(true, null, 'Machine archived');
}

// -- Restore from archive --
if ($action === 'restore') {
    db_execute($conn, 'UPDATE machines SET archived = 0 WHERE name = ?', 's', [$machine_name]);

    db_execute(
        $conn,
        'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
        'ssss',
        [$logged_in['username'], 'restore_machine', $machine_name, 'Machine restored']
    );

    respond(true, null, 'Machine restored');
}

// -- Permanently delete (removes machine + all related data) --
if ($action === 'delete') {
    // delete related data first (foreign key safety, even without FK constraints)
    db_execute($conn, 'DELETE FROM sessions WHERE machine_name = ?', 's', [$machine_name]);
    db_execute($conn, 'DELETE FROM alerts WHERE machine_name = ?', 's', [$machine_name]);
    db_execute($conn, 'DELETE FROM metrics WHERE machine_name = ?', 's', [$machine_name]);
    db_execute($conn, 'DELETE FROM commands WHERE machine_name = ?', 's', [$machine_name]);
    db_execute($conn, 'DELETE FROM screenshots WHERE machine_name = ?', 's', [$machine_name]);
    db_execute($conn, 'DELETE FROM process_snapshots WHERE machine_name = ?', 's', [$machine_name]);
    db_execute($conn, 'DELETE FROM event_logs WHERE machine_name = ?', 's', [$machine_name]);
    db_execute($conn, 'DELETE FROM machines WHERE name = ?', 's', [$machine_name]);

    db_execute(
        $conn,
        'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
        'ssss',
        [$logged_in['username'], 'delete_machine', $machine_name, 'Machine permanently deleted']
    );

    respond(true, null, 'Machine permanently deleted');
}

respond(false, null, 'action must be: archive, restore, or delete', 422);
