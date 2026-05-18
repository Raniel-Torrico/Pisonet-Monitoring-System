<?php
// screenshot.php
// POST - receives a base64 screenshot from the client and saves it
// GET  - returns the latest screenshot for a machine

require_once __DIR__ . '/../db/config.php';

validate_api_key();

// -- GET: return latest screenshot for a machine --
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $machine_name = trim($_GET['machine_name'] ?? '');
    if (empty($machine_name)) {
        respond(false, null, 'machine_name is required', 422);
    }

    $rows = db_select(
        $conn,
        'SELECT image_data, recorded_at
         FROM screenshots
         WHERE machine_name = ?
         ORDER BY recorded_at DESC
         LIMIT 1',
        's',
        [$machine_name]
    );

    if (empty($rows)) {
        respond(true, ['image' => null, 'recorded_at' => null], 'No screenshot yet');
    }

    respond(true, [
        'image'       => $rows[0]['image_data'],
        'recorded_at' => $rows[0]['recorded_at'],
    ], 'OK');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

$body         = get_body();
$machine_name = trim($body['machine_name'] ?? '');
$image_data   = trim($body['image']        ?? '');

if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
if (empty($image_data))   respond(false, null, 'image is required', 422);

// Basic check that it looks like a base64 image
if (!preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $image_data)) {
    respond(false, null, 'image must be a base64 encoded PNG or JPEG', 422);
}

// Keep only the latest screenshot per machine
db_execute(
    $conn,
    'DELETE FROM screenshots WHERE machine_name = ?',
    's',
    [$machine_name]
);

db_execute(
    $conn,
    'INSERT INTO screenshots (machine_name, image_data) VALUES (?, ?)',
    'ss',
    [$machine_name, $image_data]
);

respond(true, null, 'Screenshot saved');
