<?php
// analytics.php
// Returns income and session stats for the analytics tab.
// Income figures are based on coin_transactions (actual individual coin
// inserts) rather than sessions.pesos, since that's the real cash record.

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

// -- Income totals (based on actual coin inserts) --
// Today
$today = db_select(
    $conn,
    'SELECT COALESCE(SUM(denomination), 0) AS total, COUNT(*) AS count
     FROM coin_transactions WHERE DATE(inserted_at) = CURDATE()'
);

// This week
$week = db_select(
    $conn,
    'SELECT COALESCE(SUM(denomination), 0) AS total, COUNT(*) AS count
     FROM coin_transactions WHERE YEARWEEK(inserted_at, 1) = YEARWEEK(CURDATE(), 1)'
);

// This month
$month = db_select(
    $conn,
    'SELECT COALESCE(SUM(denomination), 0) AS total, COUNT(*) AS count
     FROM coin_transactions
     WHERE MONTH(inserted_at) = MONTH(CURDATE())
     AND YEAR(inserted_at) = YEAR(CURDATE())'
);

// -- Session stats --
// Average session length in minutes (only completed sessions)
$avg = db_select(
    $conn,
    'SELECT COALESCE(AVG(duration_min), 0) AS avg_duration
     FROM sessions WHERE ended_at IS NOT NULL AND DATE(started_at) = CURDATE()'
);

$sessions_today_count = db_select(
    $conn,
    'SELECT COUNT(*) AS count FROM sessions WHERE DATE(started_at) = CURDATE()'
);

// Average coins inserted per session (coins per session, based on real transactions)
// Groups coin_transactions by machine+time-window-per-session isn't exact without
// a session_id link, so this estimates using total coins today / sessions today.
$avg_coins_per_session = db_select(
    $conn,
    'SELECT
        (SELECT COUNT(*) FROM coin_transactions WHERE DATE(inserted_at) = CURDATE()) AS total_coins,
        (SELECT COUNT(*) FROM sessions WHERE DATE(started_at) = CURDATE()) AS total_sessions'
);
$tc = (int) ($avg_coins_per_session[0]['total_coins'] ?? 0);
$ts = (int) ($avg_coins_per_session[0]['total_sessions'] ?? 0);
$avg_coins = $ts > 0 ? round($tc / $ts, 1) : 0;

// Average peso value per session, based on actual coins inserted today
$avg_income = db_select(
    $conn,
    'SELECT COALESCE(AVG(denomination), 0) AS avg_denom
     FROM coin_transactions WHERE DATE(inserted_at) = CURDATE()'
);

// -- Daily breakdown for the last 7 days, split by denomination (stacked chart) --
$daily = db_select(
    $conn,
    'SELECT
        DATE(inserted_at) AS day,
        denomination,
        COUNT(*) AS count,
        SUM(denomination) AS total
     FROM coin_transactions
     WHERE inserted_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(inserted_at), denomination
     ORDER BY day ASC'
);

// Build 7 days, each with a denomination breakdown + grand total
$chart_data = [];
for ($i = 6; $i >= 0; $i--) {
    $date     = date('Y-m-d', strtotime("-$i days"));
    $day_name = date('D', strtotime("-$i days"));

    $day_rows = array_values(array_filter($daily, fn($d) => $d['day'] === $date));

    $by_denom = ['1' => 0, '5' => 0, '10' => 0, '20' => 0];
    $day_total = 0;
    $day_count = 0;
    foreach ($day_rows as $r) {
        $denom_key = (string)(int)(float)$r['denomination'];
        if (isset($by_denom[$denom_key])) {
            $by_denom[$denom_key] = (float) $r['total'];
        }
        $day_total += (float) $r['total'];
        $day_count += (int) $r['count'];
    }

    $chart_data[] = [
        'label'       => $day_name,
        'date'        => $date,
        'value'       => $day_total,
        'count'       => $day_count,
        'breakdown'   => [
            'p1'  => $by_denom['1'],
            'p5'  => $by_denom['5'],
            'p10' => $by_denom['10'],
            'p20' => $by_denom['20'],
        ],
    ];
}

// -- Top machines by usage today (still session-based, this tracks machine utilization) --
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

// -- Peak hours (based on actual coin insert times, more accurate than session start) --
$peak_hours = db_select(
    $conn,
    'SELECT
        MOD(HOUR(inserted_at) + 8, 24) AS hour,
        COUNT(*) AS transactions,
        COALESCE(SUM(denomination), 0) AS income
     FROM coin_transactions
     WHERE DATE(inserted_at) = CURDATE()
     GROUP BY MOD(HOUR(inserted_at) + 8, 24)
     ORDER BY transactions DESC
     LIMIT 5'
);

foreach ($peak_hours as &$row) {
    $h = (int) $row['hour'];
    $row['hour_label'] = $h === 0  ? '12 AM'
        : ($h < 12  ? "{$h} AM"
        : ($h === 12 ? '12 PM'
        : ($h - 12) . ' PM'));
}
unset($row);

// -- Monthly comparison (based on coin inserts) --
$this_month_total = (float) $month[0]['total'];
$last_month = db_select(
    $conn,
    'SELECT COALESCE(SUM(denomination), 0) AS total
     FROM coin_transactions
     WHERE MONTH(inserted_at) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
     AND YEAR(inserted_at) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))'
);
$last_month_total = (float) $last_month[0]['total'];

$change_pct = $last_month_total > 0
    ? round((($this_month_total - $last_month_total) / $last_month_total) * 100, 1)
    : 0;

// -- Coin denomination breakdown (today) --
$coin_breakdown_today = db_select(
    $conn,
    'SELECT denomination, COUNT(*) AS count, SUM(denomination) AS total
     FROM coin_transactions
     WHERE DATE(inserted_at) = CURDATE()
     GROUP BY denomination
     ORDER BY denomination ASC'
);

// -- Coin denomination breakdown (this week) --
$coin_breakdown_week = db_select(
    $conn,
    'SELECT denomination, COUNT(*) AS count, SUM(denomination) AS total
     FROM coin_transactions
     WHERE YEARWEEK(inserted_at, 1) = YEARWEEK(CURDATE(), 1)
     GROUP BY denomination
     ORDER BY denomination ASC'
);

function normalize_coin_breakdown($raw) {
    $denominations = [1, 5, 10, 20];
    $result = [];
    foreach ($denominations as $d) {
        $found = array_values(array_filter($raw, fn($c) => (float)$c['denomination'] === (float)$d));
        $result[] = [
            'denomination' => $d,
            'count'        => !empty($found) ? (int) $found[0]['count'] : 0,
            'total'        => !empty($found) ? (float) $found[0]['total'] : 0,
        ];
    }
    return $result;
}

$coin_breakdown_today = normalize_coin_breakdown($coin_breakdown_today);
$coin_breakdown_week  = normalize_coin_breakdown($coin_breakdown_week);

respond(true, [
    'income' => [
        'today' => [
            'total' => (float) $today[0]['total'],
            'count' => (int)   $today[0]['count'],
        ],
        'week' => [
            'total' => (float) $week[0]['total'],
            'count' => (int)   $week[0]['count'],
        ],
        'month' => [
            'total' => (float) $month[0]['total'],
            'count' => (int)   $month[0]['count'],
        ],
    ],
    'stats' => [
        'avg_duration'       => round((float) $avg[0]['avg_duration'], 1),
        'avg_income'         => round((float) $avg_income[0]['avg_denom'], 2),
        'avg_coins_per_session' => $avg_coins,
        'sessions_today' => (int) $sessions_today_count[0]['count'],
    ],
    'month_comparison' => [
        'this_month' => $this_month_total,
        'last_month' => $last_month_total,
        'change_pct' => $change_pct,
    ],
    'chart'                 => $chart_data,
    'top_machines'          => $top_machines,
    'peak_hours'            => $peak_hours,
    'coin_breakdown_today'  => $coin_breakdown_today,
    'coin_breakdown_week'   => $coin_breakdown_week,
], 'OK');