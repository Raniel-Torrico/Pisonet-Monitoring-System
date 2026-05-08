<?php
// config.php
// This file is included by all API endpoints.
// It sets up the database connection and shared helper functions.

// -- Database settings --
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'pisonet_db');

// -- API Key --
// This must match the API_KEY in client.py and api.js
define('API_KEY', 'pisonet123');

// -- CORS headers --
// These allow the React app to talk to this PHP server
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

// Handle browser preflight request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// -- Connect to database --
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($conn->connect_error) {
    respond(false, null, 'Database connection failed', 500);
}
$conn->set_charset('utf8mb4');

// -- Standard response function --
// Every endpoint uses this to return JSON
// Usage: respond(true, $data) or respond(false, null, 'error message', 400)
function respond(bool $success, $data = null, string $message = 'OK', int $status = 200): void {
    http_response_code($status);
    echo json_encode([
        'success' => $success,
        'data'    => $data,
        'message' => $message,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// -- Check API key --
// Call this at the top of any endpoint to block unauthorized requests
function validate_api_key(): void {
    $headers = getallheaders();
    $key     = $headers['X-API-Key'] ?? $headers['x-api-key'] ?? '';
    if ($key !== API_KEY) {
        respond(false, null, 'Unauthorized: invalid or missing API key', 401);
    }
}

// -- Read JSON request body --
// Returns the POST body as an array
function get_body(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

// -- Run a SELECT query --
// Returns an array of rows
// Example: $rows = db_select($conn, "SELECT * FROM machines WHERE name = ?", 's', [$name]);
function db_select(mysqli $conn, string $sql, string $types = '', array $params = []): array {
    $stmt = $conn->prepare($sql);
    if (!$stmt) respond(false, null, 'DB error: ' . $conn->error, 500);
    if ($types && $params) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows   = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    $stmt->close();
    return $rows;
}

// -- Run an INSERT, UPDATE, or DELETE query --
// Returns the inserted row ID for INSERT, or true/false for others
// Example: db_execute($conn, "INSERT INTO machines (name) VALUES (?)", 's', [$name]);
function db_execute(mysqli $conn, string $sql, string $types = '', array $params = []): int|bool {
    $stmt = $conn->prepare($sql);
    if (!$stmt) respond(false, null, 'DB error: ' . $conn->error, 500);
    if ($types && $params) $stmt->bind_param($types, ...$params);
    $ok = $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();
    return $id ?: $ok;
}
