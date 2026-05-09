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
header('Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Auth-Token');

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

// -- Check auth token and return the logged-in admin --
// Call this when you need to know WHO is making the request
// Returns the admin row from the database
// If token is missing or expired, it stops and returns 401
function validate_token(mysqli $conn): array {
    $headers = getallheaders();
    $token   = $headers['X-Auth-Token'] ?? $headers['x-auth-token'] ?? '';

    if (empty($token)) {
        respond(false, null, 'Unauthorized: missing token', 401);
    }

    $rows = db_select(
        $conn,
        'SELECT id, username, role, token_expires
         FROM admins WHERE token = ? LIMIT 1',
        's',
        [$token]
    );

    if (empty($rows)) {
        respond(false, null, 'Unauthorized: invalid token', 401);
    }

    // Check if token has expired
    if (new DateTime() > new DateTime($rows[0]['token_expires'])) {
        respond(false, null, 'Unauthorized: token has expired, please log in again', 401);
    }

    return $rows[0];
}

// -- Check that the logged-in user is an admin --
// Call this on endpoints that only admins can use
function require_admin(mysqli $conn): array {
    $admin = validate_token($conn);
    if ($admin['role'] !== 'admin') {
        respond(false, null, 'Forbidden: admin access required', 403);
    }
    return $admin;
}

// -- Read JSON request body --
function get_body(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

// -- Run a SELECT query --
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
function db_execute(mysqli $conn, string $sql, string $types = '', array $params = []): int|bool {
    $stmt = $conn->prepare($sql);
    if (!$stmt) respond(false, null, 'DB error: ' . $conn->error, 500);
    if ($types && $params) $stmt->bind_param($types, ...$params);
    $ok = $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();
    return $id ?: $ok;
}
