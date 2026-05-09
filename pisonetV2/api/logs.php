<?php
// logs.php
// Returns the latest audit log entries from the database.
// Supports optional filtering by actor, action, or date range.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

// Optional filters from query string
// Example: /logs.php?actor=admin&limit=20
$actor  = trim($_GET['actor']  ?? '');
$action = trim($_GET['action'] ?? '');
$limit  = isset($_GET['limit']) ? (int) $_GET['limit'] : 50;

// Clamp limit between 1 and 200
$limit = max(1, min(200, $limit));

// Build query with optional filters
$where  = [];
$types  = '';
$params = [];

if (!empty($actor)) {
    $where[]  = 'actor = ?';
    $types   .= 's';
    $params[] = $actor;
}

if (!empty($action)) {
    $where[]  = 'action = ?';
    $types   .= 's';
    $params[] = $action;
}

$where_sql = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

$logs = db_select(
    $conn,
    "SELECT id, actor, action, target, detail, created_at
     FROM logs
     $where_sql
     ORDER BY created_at DESC
     LIMIT $limit",
    $types,
    $params
);

respond(true, ['logs' => $logs], 'OK');
