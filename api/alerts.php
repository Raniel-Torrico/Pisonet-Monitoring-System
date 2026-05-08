<?php
// alerts.php
// GET  - returns all unresolved alerts
// POST - marks an alert as resolved

require_once __DIR__ . '/../db/config.php';

validate_api_key();

// -- Get all unresolved alerts --
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $alerts = db_select(
        $conn,
        'SELECT id, machine_name, type, message, created_at
         FROM alerts WHERE resolved = 0
         ORDER BY created_at DESC LIMIT 50'
    );

    respond(true, ['alerts' => $alerts], 'OK');
}

// -- Resolve an alert --
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body   = get_body();
    $action = trim($body['action'] ?? '');
    $id     = isset($body['id']) ? (int) $body['id'] : 0;

    if ($action !== 'resolve') respond(false, null, 'action must be: resolve', 422);
    if ($id <= 0)              respond(false, null, 'id must be a positive number', 422);

    $rows = db_select($conn, 'SELECT id FROM alerts WHERE id = ? LIMIT 1', 'i', [$id]);
    if (empty($rows)) respond(false, null, 'Alert not found', 404);

    db_execute($conn, 'UPDATE alerts SET resolved = 1 WHERE id = ?', 'i', [$id]);

    respond(true, null, 'Alert resolved');
}

respond(false, null, 'Method not allowed', 405);
