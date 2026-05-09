<?php
// login.php
// Checks username and password, then returns a session token.
// The token is saved to the database and used to keep the admin logged in.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, null, 'Method not allowed', 405);
}

// No API key check here — this is the login page, anyone can try

$body     = get_body();
$username = trim($body['username'] ?? '');
$password = trim($body['password'] ?? '');

// Basic validation
if (empty($username)) respond(false, null, 'Username is required', 422);
if (empty($password)) respond(false, null, 'Password is required', 422);
if (strlen($username) > 50 || strlen($password) > 100) {
    respond(false, null, 'Input is too long', 422);
}

// Look up the user in the database
$rows = db_select(
    $conn,
    'SELECT id, username, password, role FROM admins WHERE username = ? LIMIT 1',
    's',
    [$username]
);

// Use a vague error so attackers cannot tell if the username exists
if (empty($rows)) {
    respond(false, null, 'Invalid username or password', 401);
}

$admin = $rows[0];

// Check the password against the stored hash
if (!password_verify($password, $admin['password'])) {
    respond(false, null, 'Invalid username or password', 401);
}

// Generate a random token and save it
// Token expires after 8 hours
$token   = bin2hex(random_bytes(32));
$expires = date('Y-m-d H:i:s', strtotime('+8 hours'));

db_execute(
    $conn,
    'UPDATE admins SET token = ?, token_expires = ? WHERE id = ?',
    'ssi',
    [$token, $expires, $admin['id']]
);

// Save to audit log
db_execute(
    $conn,
    'INSERT INTO logs (actor, action, target, detail) VALUES (?, ?, ?, ?)',
    'ssss',
    [$username, 'login', 'admins', 'Login successful']
);

respond(true, [
    'id'       => (int) $admin['id'],
    'token'    => $token,
    'username' => $admin['username'],
    'role'     => $admin['role'],
    'expires'  => $expires,
], 'Login successful');
