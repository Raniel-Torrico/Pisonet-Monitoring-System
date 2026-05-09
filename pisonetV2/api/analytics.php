<?php
// analytics.php
// Returns income and session stats for the analytics tab.
// All numbers come from the sessions table.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

// -- Income totals --
// Today
$today = db_select(
    $conn,
    'SELECT COALESCE(SUM(pesos), 0) AS total, COUNT(*) AS count
     FROM sessions WHERE DATE(started_at) = CURDATE()'
);

// This week
$week = db_select(
    $conn,
    'SELECT COALESCE(SUM(pesos), 0) AS total, COUNT(*) AS count
     FROM sessions WHERE YEARWEEK(started_at, 1) = YEARWEEK(CURDATE(), 1)'
);

// This month
$month = db_select(
    $conn,
    'SELECT COALESCE(SUM(pesos), 0) AS total, COUNT(*) AS count
     FROM sessions
     WHERE MONTH(started_at) = MONTH(CURDATE())
     AND YEAR(started_at) = YEAR(CURDATE())'
);

// -- Session stats --
// Average session length in minutes (only completed sessions)
$avg = db_select(
    $conn,
    'SELECT COALESCE(AVG(duration_min), 0) AS avg_duration
     FROM sessions WHERE ended_at IS NOT NULL'
);

// Average income per session today
$avg_income = db_select(
    $conn,
    'SELECT COALESCE(AVG(pesos), 0) AS avg_pesos
     FROM sessions WHERE DATE(started_at) = CURDATE()'
);

// -- Daily breakdown for the last 7 days --
// Used for the bar chart
$daily = db_select(
    $conn,
    'SELECT
        DATE(started_at) AS day,
        DAYNAME(started_at) AS day_name,
        COALESCE(SUM(pesos), 0) AS total,
        COUNT(*) AS count
     FROM sessions
     WHERE started_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(started_at), DAYNAME(started_at)
     ORDER BY day ASC'
);

// Fill in missing days with zero so the chart always shows 7 bars
$chart_data = [];
for ($i = 6; $i >= 0; $i--) {
    $date     = date('Y-m-d', strtotime("-$i days"));
    $day_name = date('D', strtotime("-$i days")); // Mon, Tue, etc.

    // Check if this date has data
    $found = array_filter($daily, fn($d) => $d['day'] === $date);
    $found = array_values($found);

    $chart_data[] = [
        'label' => $day_name,
        'date'  => $date,
        'value' => !empty($found) ? (float) $found[0]['total'] : 0,
        'count' => !empty($found) ? (int)   $found[0]['count'] : 0,
    ];
}

// -- Top machines by usage today --
$top_machines = db_select(
    $conn,
    'SELECT machine_name,
            COUNT(*) AS sessions,
            COALESCE(SUM(pesos), 0) AS income
     FROM sessions
     WHERE DATE(started_at) = CURDATE()
     GROUP BY machine_name
     ORDER BY income DESC
     LIMIT 5'
);

respond(true, [
    'income' => [
        'today' => [
            'total'   => (float) $today[0]['total'],
            'count'   => (int)   $today[0]['count'],
        ],
        'week' => [
            'total'   => (float) $week[0]['total'],
            'count'   => (int)   $week[0]['count'],
        ],
        'month' => [
            'total'   => (float) $month[0]['total'],
            'count'   => (int)   $month[0]['count'],
        ],
    ],
    'stats' => [
        'avg_duration' => round((float) $avg[0]['avg_duration'], 1),
        'avg_income'   => round((float) $avg_income[0]['avg_pesos'], 2),
    ],
    'chart'        => $chart_data,
    'top_machines' => $top_machines,
], 'OK');
