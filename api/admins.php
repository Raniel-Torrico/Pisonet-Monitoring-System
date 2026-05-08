<?php
// admins.php
// Handles all admin/staff account management.
// GET  - returns list of all accounts
// POST - create, change password, or delete an account

require_once __DIR__ . '/../db/config.php';

validate_api_key();

// -- Password strength check --
// Same rules as the frontend so we validate on both sides
function is_strong_password(string $password): bool {
    if (strlen($password) < 8)          return false; // at least 8 characters
    if (!preg_match('/[A-Z]/', $password)) return false; // at least one uppercase
    if (!preg_match('/[0-9]/', $password)) return false; // at least one number
    if (!preg_match('/[!@#$%^&*()\-_=+\[\]{};:\'",.<>\/?\\\\|]/', $password)) return false; // at least one special char
    return true;
}

// -- GET: return all accounts --
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $accounts = db_select(
        $conn,
        'SELECT id, username, role, created_at FROM admins ORDER BY created_at ASC'
    );
    respond(true, ['accounts' => $accounts], 'OK');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

$body   = get_body();
$action = trim($body['action'] ?? '');

// -- Add a new account --
if ($action === 'add') {
    $username = trim($body['username'] ?? '');
    $password = trim($body['password'] ?? '');
    $role     = trim($body['role']     ?? 'staff');

    if (empty($username))  respond(false, null, 'Username is required', 422);
    if (empty($password))  respond(false, null, 'Password is required', 422);
    if (strlen($username) > 50) respond(false, null, 'Username is too long', 422);

    // Check password strength
    if (!is_strong_password($password)) {
        respond(false, null, 'Password is too weak. Must be 8+ characters with uppercase, number, and special character.', 422);
    }

    $allowed_roles = ['admin', 'staff'];
    if (!in_array($role, $allowed_roles, true)) {
        respond(false, null, 'Role must be: admin or staff', 422);
    }

    // Check if username is already taken
    $existing = db_select($conn, 'SELECT id FROM admins WHERE username = ? LIMIT 1', 's', [$username]);
    if (!empty($existing)) {
        respond(false, null, 'Username is already taken', 422);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);

    $id = db_execute(
        $conn,
        'INSERT INTO admins (username, password, role) VALUES (?, ?, ?)',
        'sss',
        [$username, $hash, $role]
    );

    db_execute(
        $conn,
        'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
        'ssss',
        ['admin', 'add_account', $username, "Role: $role"]
    );

    respond(true, ['id' => (int) $id], 'Account created');
}

// -- Change password --
if ($action === 'change_password') {
    $id           = isset($body['id'])           ? (int)  $body['id']       : 0;
    $new_password = trim($body['new_password']   ?? '');
    $actor        = trim($body['actor']          ?? 'admin');

    if ($id <= 0)             respond(false, null, 'id is required', 422);
    if (empty($new_password)) respond(false, null, 'new_password is required', 422);

    // Check password strength
    if (!is_strong_password($new_password)) {
        respond(false, null, 'Password is too weak. Must be 8+ characters with uppercase, number, and special character.', 422);
    }

    $rows = db_select($conn, 'SELECT username FROM admins WHERE id = ? LIMIT 1', 'i', [$id]);
    if (empty($rows)) respond(false, null, 'Account not found', 404);

    $hash = password_hash($new_password, PASSWORD_BCRYPT);

    db_execute($conn, 'UPDATE admins SET password = ? WHERE id = ?', 'si', [$hash, $id]);

    db_execute(
        $conn,
        'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
        'ssss',
        [$actor, 'change_password', $rows[0]['username'], 'Password updated']
    );

    respond(true, null, 'Password updated');
}

// -- Delete an account --
if ($action === 'delete') {
    $id = isset($body['id']) ? (int) $body['id'] : 0;

    if ($id <= 0) respond(false, null, 'id is required', 422);

    $rows = db_select($conn, 'SELECT username, role FROM admins WHERE id = ? LIMIT 1', 'i', [$id]);
    if (empty($rows)) respond(false, null, 'Account not found', 404);

    // Do not allow deleting the last admin
    if ($rows[0]['role'] === 'admin') {
        $admin_count = db_select($conn, 'SELECT COUNT(*) AS cnt FROM admins WHERE role = "admin"');
        if ((int) $admin_count[0]['cnt'] <= 1) {
            respond(false, null, 'Cannot delete the last admin account', 422);
        }
    }

    db_execute($conn, 'DELETE FROM admins WHERE id = ?', 'i', [$id]);

    db_execute(
        $conn,
        'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
        'ssss',
        ['admin', 'delete_account', $rows[0]['username'], "Role was: {$rows[0]['role']}"]
    );

    respond(true, null, 'Account deleted');
}

respond(false, null, 'action must be: add, change_password, or delete', 422);
