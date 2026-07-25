<?php
// report.php
// Fetches analytics data and returns it as JSON for the frontend
// to use when generating the PDF report via the React download button.
// The actual PDF is generated client-side using jsPDF.
//
// GET ?type=daily   - income and sessions for today
// GET ?type=weekly  - income and sessions for last 7 days
// GET ?type=monthly - income and sessions for this month

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

$type = trim($_GET['type'] ?? 'weekly');
$allowed_types = ['daily', 'weekly', 'monthly'];
if (!in_array($type, $allowed_types, true)) {
    respond(false, null, 'type must be: daily, weekly, or monthly', 422);
}

// -- Date range based on type --
switch ($type) {
    case 'daily':
        $label      = 'Daily Report — ' . date('F j, Y');
        $date_where = 'DATE(started_at) = CURDATE()';
        $group_by   = 'HOUR(started_at)';
        $select_period = 'HOUR(started_at) AS period, DATE_FORMAT(started_at, "%l %p") AS period_label';
        break;
    case 'monthly':
        $label      = 'Monthly Report — ' . date('F Y');
        $date_where = 'MONTH(started_at) = MONTH(CURDATE()) AND YEAR(started_at) = YEAR(CURDATE())';
        $group_by   = 'DATE(started_at)';
        $select_period = 'DATE(started_at) AS period, DATE_FORMAT(started_at, "%b %d") AS period_label';
        break;
    default: // weekly
        $label      = 'Weekly Report — ' . date('M j') . ' to ' . date('M j', strtotime('+6 days'));
        $date_where = 'started_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
        $group_by   = 'DATE(started_at)';
        $select_period = 'DATE(started_at) AS period, DATE_FORMAT(started_at, "%a %b %d") AS period_label';
        break;
}

// -- Income summary --
$summary = db_select(
    $conn,
    "SELECT
        COALESCE(SUM(pesos), 0)           AS total_income,
        COUNT(*)                          AS total_sessions,
        COALESCE(AVG(pesos), 0)           AS avg_income,
        COALESCE(AVG(duration_min), 0)    AS avg_duration,
        COALESCE(MAX(pesos), 0)           AS max_income,
        COALESCE(MIN(pesos), 0)           AS min_income
     FROM sessions
     WHERE $date_where"
);

// -- Chart data (grouped by period) --
$chart = db_select(
    $conn,
    "SELECT $select_period,
        COALESCE(SUM(pesos), 0) AS income,
        COUNT(*) AS sessions
     FROM sessions
     WHERE $date_where
     GROUP BY $group_by
     ORDER BY period ASC"
);

// -- Per machine breakdown --
$machines = db_select(
    $conn,
    "SELECT
        machine_name,
        COUNT(*)                       AS sessions,
        COALESCE(SUM(pesos), 0)        AS income,
        COALESCE(AVG(duration_min), 0) AS avg_duration
     FROM sessions
     WHERE $date_where
     GROUP BY machine_name
     ORDER BY income DESC"
);

// -- Top session --
$top_session = db_select(
    $conn,
    "SELECT machine_name, pesos,
 COALESCE(duration_min, TIMESTAMPDIFF(MINUTE, started_at, NOW())) AS duration_min,
 started_at
 FROM sessions
 WHERE $date_where
 ORDER BY pesos DESC
 LIMIT 1"
);

$peak_hours = db_select(
    $conn,
    'SELECT
    MOD(HOUR(started_at) + 8, 24) AS hour,
    COUNT(*) AS sessions,
    COALESCE(SUM(pesos), 0) AS income
 FROM sessions
 WHERE DATE(started_at) = CURDATE()
 GROUP BY MOD(HOUR(started_at) + 8, 24)
 ORDER BY sessions DESC
 LIMIT 5'
);

// Format the hour label nicely e.g. "2 PM", "10 AM"
foreach ($peak_hours as &$row) {
    $h = (int) $row['hour'];
    $row['hour_label'] = ($h === 0) ? '12 AM'
        : ($h < 12  ? "{$h} AM"
        : ($h === 12 ? '12 PM'
        : ($h - 12) . ' PM'));
}
unset($row);

respond(true, [
    'type'        => $type,
    'label'       => $label,
    'generated_at'=> date('Y-m-d H:i:s'),
    'summary'     => [
        'total_income'   => round((float) $summary[0]['total_income'], 2),
        'total_sessions' => (int) $summary[0]['total_sessions'],
        'avg_income'     => round((float) $summary[0]['avg_income'], 2),
        'avg_duration'   => round((float) $summary[0]['avg_duration'], 1),
        'max_income'     => round((float) $summary[0]['max_income'], 2),
        'min_income'     => round((float) $summary[0]['min_income'], 2),
    ],
    'chart'       => $chart,
    'machines'    => $machines,
    'top_session' => !empty($top_session) ? $top_session[0] : null,
    'peak_hours'  => $peak_hours,
], 'OK');
