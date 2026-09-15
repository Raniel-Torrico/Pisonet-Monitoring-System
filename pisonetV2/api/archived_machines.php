<?php
// archived_machines.php
// Returns list of archived machines so admin can restore or permanently delete them.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();
require_admin($conn);

$machines = db_select(
    $conn,
    'SELECT name, mac, os,
     DATE_FORMAT(last_seen, "%Y-%m-%dT%H:%i:%sZ") AS last_seen,
     DATE_FORMAT(created_at, "%Y-%m-%dT%H:%i:%sZ") AS created_at
     FROM machines WHERE archived = 1 ORDER BY name ASC'
);

respond(true, ['machines' => $machines], 'OK');