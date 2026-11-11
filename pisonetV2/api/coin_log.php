<?php
// coin_log.php
// Logs every individual coin insertion with its denomination.
// Separate from session.php since this tracks raw hardware events,
// used for denomination-based analytics (coin breakdown, stacked chart).

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$body         = get_body();
$machine_name = trim($body['machine_name'] ?? '');
$denomination = isset($body['denomination']) ? (float) $body['denomination'] : null;

if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
if ($denomination === null || $denomination <= 0) respond(false, null, 'denomination is required', 422);

// Only allow real Philippine peso coin denominations
// (floats used here since $denomination is cast to float above —
// comparing against plain ints with strict in_array would always fail)
$allowed_denominations = [1.0, 5.0, 10.0, 20.0];
if (!in_array($denomination, $allowed_denominations, true)) {
    respond(false, null, 'Invalid denomination', 422);
}

db_execute(
    $conn,
    'INSERT INTO coin_transactions (machine_name, denomination) VALUES (?, ?)',
    'sd',
    [$machine_name, $denomination]
);

respond(true, null, 'Coin logged');