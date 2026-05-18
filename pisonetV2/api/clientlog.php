<?php
// clientlog.php
// Called by the Python client when LOG_TO_SERVER is enabled.
// Saves client-side log messages to the logs table in the database.
// Used in diskless setups where local file storage is not available.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$body         = get_body();
$machine_name = trim($body['machine_name'] ?? '');
$level        = trim($body['level']        ?? 'INFO');
$message      = trim($body['message']      ?? '');

// Basic validation
if (empty($machine_name)) respond(false, null, 'machine_name is required', 422);
if (empty($message))      respond(false, null, 'message is required', 422);

// Only allow known log levels
$allowed_levels = ['INFO', 'WARNING', 'ERROR', 'DEBUG'];
if (!in_array(strtoupper($level), $allowed_levels, true)) {
    $level = 'INFO';
}

// Save to the logs table
// Actor = the machine name, action = the log level, detail = the message
db_execute(
    $conn,
    'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
    'ssss',
    [$machine_name, strtolower($level), 'client_log', $message]
);

respond(true, null, 'Log saved');
