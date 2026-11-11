<?php
// analytics_period.php
// Returns income stats for ONE chosen period (day, week, month or custom)
// and also the previous period so the dashboard can compare them.
//
// GET ?mode=day&date=2026-10-17
// GET ?mode=week&date=2026-10-17    (week starts on Monday)
// GET ?mode=month&date=2026-10-17
// GET ?mode=custom&from=2026-10-01&to=2026-10-15

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

// -- Timezone settings --
// The database saves time in UTC, but the shop is in the Philippines (UTC+8).
// If your database already saves Philippine time, set this to false.
$DB_IS_UTC = true;

$tz_local = new DateTimeZone('Asia/Manila');
$tz_db    = new DateTimeZone($DB_IS_UTC ? 'UTC' : 'Asia/Manila');
$shift    = $DB_IS_UTC ? 8 : 0; // hours to add to a database time to get Philippine time

// -- Helper: turn "2026-10-17" into a DateTime at midnight, or null if invalid --
function parse_date($str, $tz) {
    $d = DateTime::createFromFormat('Y-m-d', $str, $tz);
    if (!$d || $d->format('Y-m-d') !== $str) return null;
    $d->setTime(0, 0, 0);
    return $d;
}

// -- Helper: convert a Philippine DateTime into the string the database uses --
function db_str($dt, $tz_db) {
    $copy = clone $dt;
    $copy->setTimezone($tz_db);
    return $copy->format('Y-m-d H:i:s');
}

// -- Helper: readable label for a range (end is NOT included) --
function range_label($mode, $start, $end) {
    if ($mode === 'day')   return $start->format('D, M j, Y');
    if ($mode === 'month') return $start->format('F Y');
    $last = (clone $end)->modify('-1 day');
    return $start->format('M j') . ' – ' . $last->format('M j, Y');
}

// -- Helper: totals for a range --
function coin_totals($conn, $from, $to) {
    $c = db_select(
        $conn,
        'SELECT COALESCE(SUM(denomination), 0) AS total, COUNT(*) AS coins
         FROM coin_transactions
         WHERE inserted_at >= ? AND inserted_at < ?',
        'ss',
        [$from, $to]
    );
    $s = db_select(
        $conn,
        'SELECT COUNT(*) AS sessions,
                COALESCE(AVG(CASE WHEN ended_at IS NOT NULL THEN duration_min END), 0) AS avg_duration
         FROM sessions
         WHERE started_at >= ? AND started_at < ?',
        'ss',
        [$from, $to]
    );

    $total    = (float) $c[0]['total'];
    $coins    = (int)   $c[0]['coins'];
    $sessions = (int)   $s[0]['sessions'];

    return [
        'total'                 => $total,
        'coins'                 => $coins,
        'sessions'              => $sessions,
        'avg_duration'          => round((float) $s[0]['avg_duration'], 1),
        'avg_coins_per_session' => $sessions > 0 ? round($coins / $sessions, 1) : 0,
        'avg_coin_value'        => $coins > 0 ? round($total / $coins, 2) : 0,
    ];
}

// -- Helper: income per bucket (per hour or per day) split by coin type --
function bucket_data($conn, $unit, $label_fmt, $start, $end, $shift, $tz_db) {
    $from = db_str($start, $tz_db);
    $to   = db_str($end,   $tz_db);

    $expr = $unit === 'hour'
        ? "HOUR(DATE_ADD(inserted_at, INTERVAL $shift HOUR))"
        : "DATE(DATE_ADD(inserted_at, INTERVAL $shift HOUR))";

    $rows = db_select(
        $conn,
        "SELECT $expr AS bucket, denomination, COUNT(*) AS count, SUM(denomination) AS total
         FROM coin_transactions
         WHERE inserted_at >= ? AND inserted_at < ?
         GROUP BY bucket, denomination",
        'ss',
        [$from, $to]
    );

    // make an empty bucket for every hour / day, so the chart has no gaps
    $buckets = [];
    $blank   = ['value' => 0, 'count' => 0, 'p1' => 0, 'p5' => 0, 'p10' => 0, 'p20' => 0];

    if ($unit === 'hour') {
        for ($h = 0; $h < 24; $h++) {
            $label = $h === 0 ? '12a' : ($h < 12 ? "{$h}a" : ($h === 12 ? '12p' : ($h - 12) . 'p'));
            $buckets[(string) $h] = ['label' => $label] + $blank;
        }
    } else {
        $d = clone $start;
        while ($d < $end) {
            $buckets[$d->format('Y-m-d')] = ['label' => $d->format($label_fmt)] + $blank;
            $d->modify('+1 day');
        }
    }

    foreach ($rows as $r) {
        $key = (string) $r['bucket'];
        if (!isset($buckets[$key])) continue;
        $denom_key = 'p' . (int) (float) $r['denomination'];
        if (isset($buckets[$key][$denom_key])) {
            $buckets[$key][$denom_key] += (float) $r['total'];
        }
        $buckets[$key]['value'] += (float) $r['total'];
        $buckets[$key]['count'] += (int)   $r['count'];
    }

    return array_values($buckets);
}

// -- Read the mode --
$mode = trim($_GET['mode'] ?? 'day');
if (!in_array($mode, ['day', 'week', 'month', 'custom'], true)) {
    respond(false, null, 'mode must be: day, week, month, or custom', 422);
}

$now = new DateTime('now', $tz_local);

// -- Work out the current range and the previous range --
// Every range is [start, end) which means the end is NOT included.
if ($mode === 'custom') {
    $from = parse_date($_GET['from'] ?? '', $tz_local);
    $to   = parse_date($_GET['to']   ?? '', $tz_local);

    if (!$from || !$to)  respond(false, null, 'from and to must be dates like 2026-10-01', 422);
    if ($to < $from)     respond(false, null, 'The end date cannot be before the start date', 422);

    $start = clone $from;
    $end   = (clone $to)->modify('+1 day');
    $days  = (int) $start->diff($end)->days;

    if ($days > 92) respond(false, null, 'Custom range can be at most 92 days', 422);

    // previous range = same number of days right before the start
    $prev_end   = clone $start;
    $prev_start = (clone $start)->modify("-{$days} days");

} else {
    $anchor = parse_date($_GET['date'] ?? $now->format('Y-m-d'), $tz_local);
    if (!$anchor) respond(false, null, 'date must look like 2026-10-17', 422);

    if ($mode === 'day') {
        $start      = clone $anchor;
        $end        = (clone $anchor)->modify('+1 day');
        $prev_start = (clone $anchor)->modify('-1 day');
        $prev_end   = clone $start;
    } elseif ($mode === 'week') {
        $start      = (clone $anchor)->modify('monday this week');
        $end        = (clone $start)->modify('+7 days');
        $prev_start = (clone $start)->modify('-7 days');
        $prev_end   = clone $start;
    } else { // month
        $start      = new DateTime($anchor->format('Y-m-01'), $tz_local);
        $end        = (clone $start)->modify('+1 month');
        $prev_start = (clone $start)->modify('-1 month');
        $prev_end   = clone $start;
    }
}

// -- Fair comparison --
// If the period is not finished yet, only compare the previous period up to
// the same point in time (example: today until 2 PM vs yesterday until 2 PM).
$in_progress = ($now >= $start && $now < $end);

if ($in_progress) {
    $elapsed      = $now->getTimestamp() - $start->getTimestamp();
    $cmp_ts       = min($prev_start->getTimestamp() + $elapsed, $prev_end->getTimestamp());
    $prev_cmp_end = new DateTime('@' . $cmp_ts);
    $prev_cmp_end->setTimezone($tz_local);
} else {
    $prev_cmp_end = clone $prev_end;
}

// -- Totals --
$cur_from  = db_str($start,        $tz_db);
$cur_to    = db_str($end,          $tz_db);
$prev_from = db_str($prev_start,   $tz_db);

$current       = coin_totals($conn, $cur_from, $cur_to);
$previous      = coin_totals($conn, $prev_from, db_str($prev_cmp_end, $tz_db)); // fair
$previous_full = coin_totals($conn, $prev_from, db_str($prev_end,     $tz_db)); // whole period

// -- Chart --
// Day view = 24 bars (hours). The other views = one bar per day.
$unit      = $mode === 'day' ? 'hour' : 'day';
$label_fmt = $mode === 'week' ? 'D' : ($mode === 'month' ? 'j' : 'n/j');

$cur_buckets  = bucket_data($conn, $unit, $label_fmt, $start,      $end,      $shift, $tz_db);
$prev_buckets = bucket_data($conn, $unit, $label_fmt, $prev_start, $prev_end, $shift, $tz_db);

$chart = [];
foreach ($cur_buckets as $i => $b) {
    $chart[] = [
        'label'      => $b['label'],
        'value'      => $b['value'],
        'count'      => $b['count'],
        'breakdown'  => ['p1' => $b['p1'], 'p5' => $b['p5'], 'p10' => $b['p10'], 'p20' => $b['p20']],
        // same position in the previous period (the "ghost" marker)
        'prev_value' => isset($prev_buckets[$i]) ? $prev_buckets[$i]['value'] : null,
    ];
}

// -- Coin breakdown for this period --
$raw = db_select(
    $conn,
    'SELECT denomination, COUNT(*) AS count, SUM(denomination) AS total
     FROM coin_transactions
     WHERE inserted_at >= ? AND inserted_at < ?
     GROUP BY denomination',
    'ss',
    [$cur_from, $cur_to]
);

$coin_breakdown = [];
foreach ([1, 5, 10, 20] as $d) {
    $found = array_values(array_filter($raw, fn($c) => (float) $c['denomination'] === (float) $d));
    $coin_breakdown[] = [
        'denomination' => $d,
        'count'        => !empty($found) ? (int)   $found[0]['count'] : 0,
        'total'        => !empty($found) ? (float) $found[0]['total'] : 0,
    ];
}

// -- Peak hours for this period (Philippine time) --
$peak_hours = db_select(
    $conn,
    "SELECT HOUR(DATE_ADD(inserted_at, INTERVAL $shift HOUR)) AS hour,
            COUNT(*) AS transactions,
            COALESCE(SUM(denomination), 0) AS income
     FROM coin_transactions
     WHERE inserted_at >= ? AND inserted_at < ?
     GROUP BY hour
     ORDER BY transactions DESC
     LIMIT 5",
    'ss',
    [$cur_from, $cur_to]
);

foreach ($peak_hours as &$row) {
    $h = (int) $row['hour'];
    $row['hour_label'] = $h === 0 ? '12 AM'
        : ($h < 12 ? "{$h} AM" : ($h === 12 ? '12 PM' : ($h - 12) . ' PM'));
}
unset($row);

// -- Top machines for this period --
$top_machines = db_select(
    $conn,
    'SELECT
        s.machine_name,
        COUNT(*) AS sessions,
        COALESCE(c.income, 0) AS income
     FROM sessions s
     LEFT JOIN (
        SELECT
            machine_name,
            SUM(denomination) AS income
        FROM coin_transactions
        WHERE inserted_at >= ?
          AND inserted_at < ?
        GROUP BY machine_name
     ) c ON c.machine_name COLLATE utf8mb4_unicode_ci =
       s.machine_name COLLATE utf8mb4_unicode_ci
     WHERE s.started_at >= ?
       AND s.started_at < ?
     GROUP BY s.machine_name, c.income
     ORDER BY income DESC
     LIMIT 5',
    'ssss',
    [$cur_from, $cur_to, $cur_from, $cur_to]
);

// -- Machine utilization --
// Shows how busy each PC was in this period and compares it with the others.

// every machine that should be counted
// IMPORTANT: copy the same WHERE condition metrics.php uses to hide archived machines.
// Example: 'SELECT name FROM machines WHERE archived = 0 ORDER BY name ASC'
$machine_list = db_select($conn, 'SELECT name FROM machines ORDER BY name ASC');

// sessions + coins per machine for one date range
function machine_stats($conn, $from, $to) {
    $out = [];

    $s = db_select(
        $conn,
        'SELECT machine_name,
                COUNT(*) AS sessions,
                COALESCE(AVG(CASE WHEN ended_at IS NOT NULL THEN duration_min END), 0) AS avg_duration
         FROM sessions
         WHERE started_at >= ? AND started_at < ?
         GROUP BY machine_name',
        'ss',
        [$from, $to]
    );
    foreach ($s as $r) {
        $out[$r['machine_name']] = [
            'sessions'     => (int) $r['sessions'],
            'avg_duration' => round((float) $r['avg_duration'], 1),
            'coins'        => 0,
            'income'       => 0.0,
        ];
    }

    $c = db_select(
        $conn,
        'SELECT machine_name, COUNT(*) AS coins, COALESCE(SUM(denomination), 0) AS income
         FROM coin_transactions
         WHERE inserted_at >= ? AND inserted_at < ?
         GROUP BY machine_name',
        'ss',
        [$from, $to]
    );
    foreach ($c as $r) {
        $name = $r['machine_name'];
        if (!isset($out[$name])) {
            $out[$name] = ['sessions' => 0, 'avg_duration' => 0, 'coins' => 0, 'income' => 0.0];
        }
        $out[$name]['coins']  = (int)   $r['coins'];
        $out[$name]['income'] = (float) $r['income'];
    }

    return $out;
}

$cur_stats  = machine_stats($conn, $cur_from, $cur_to);
$prev_stats = machine_stats($conn, $prev_from, db_str($prev_cmp_end, $tz_db)); // fair comparison

$machine_count  = count($machine_list);
$total_sessions = 0;
$total_income   = 0.0;
foreach ($machine_list as $m) {
    $total_sessions += $cur_stats[$m['name']]['sessions'] ?? 0;
    $total_income   += $cur_stats[$m['name']]['income']   ?? 0;
}

// not enough data = we do not judge any machine
$enough_data = $machine_count >= 2 && $total_sessions >= 6;

$usage = [];
foreach ($machine_list as $m) {
    $name = $m['name'];
    $cur  = $cur_stats[$name]  ?? ['sessions' => 0, 'avg_duration' => 0, 'coins' => 0, 'income' => 0.0];
    $prev = $prev_stats[$name] ?? ['sessions' => 0, 'avg_duration' => 0, 'coins' => 0, 'income' => 0.0];

    // average of the OTHER machines (so a machine is not compared with itself)
    $others_sessions = $machine_count > 1 ? ($total_sessions - $cur['sessions']) / ($machine_count - 1) : 0;
    $others_income   = $machine_count > 1 ? ($total_income   - $cur['income'])   / ($machine_count - 1) : 0;

    $status = 'normal';
    if ($enough_data) {
        if ($cur['sessions'] == 0)                           $status = 'none';
        elseif ($cur['sessions'] < 0.5 * $others_sessions)   $status = 'low';
        elseif ($cur['sessions'] > 1.5 * $others_sessions)   $status = 'busy';
    }

    $usage[] = [
        'name'            => $name,
        'sessions'        => $cur['sessions'],
        'coins'           => $cur['coins'],
        'income'          => $cur['income'],
        'avg_duration'    => $cur['avg_duration'],
        'share_pct'       => $total_sessions > 0 ? round($cur['sessions'] / $total_sessions * 100, 1) : 0,
        'prev_sessions'   => $prev['sessions'],
        'prev_income'     => $prev['income'],
        'others_sessions' => round($others_sessions, 1),
        'others_income'   => round($others_income, 1),
        'status'          => $status,
    ];
}

// busiest machine first
usort($usage, fn($a, $b) => $b['sessions'] <=> $a['sessions'] ?: $b['income'] <=> $a['income']);

// -- Insights (plain sentences for the admin) --
$insights = [];

if (!$enough_data) {
    $insights[] = [
        'level'   => 'info',
        'machine' => null,
        'message' => 'Not enough sessions in this period to compare machines fairly. Try a longer period.',
    ];
} else {
    foreach ($usage as $u) {
        $n   = $u['name'];
        $avg = $u['others_sessions'];

        if ($u['status'] === 'none') {
            $insights[] = [
                'level'   => 'warning',
                'machine' => $n,
                'message' => "$n had no sessions in this period while the other machines averaged $avg sessions. Consider checking its availability or hardware condition.",
            ];
        } elseif ($u['status'] === 'low') {
            $insights[] = [
                'level'   => 'warning',
                'machine' => $n,
                'message' => "$n has considerably fewer sessions ({$u['sessions']}) than the other machines (average $avg). Consider checking its availability or hardware condition.",
            ];
        } elseif ($u['prev_sessions'] >= 5 && $u['sessions'] <= 0.5 * $u['prev_sessions']) {
            // normal now, but dropped a lot compared with the previous period
            $insights[] = [
                'level'   => 'warning',
                'machine' => $n,
                'message' => "$n dropped from {$u['prev_sessions']} to {$u['sessions']} sessions compared with the previous period. It may have been offline or unavailable.",
            ];
        } elseif ($u['sessions'] >= 3 && $u['others_income'] > 0 && $u['income'] < 0.5 * $u['others_income']) {
            $insights[] = [
                'level'   => 'info',
                'machine' => $n,
                'message' => "$n has normal usage but earned much less than the other machines (P" . number_format($u['income']) . " vs average P" . number_format($u['others_income']) . "). Its sessions may be short or paid with fewer coins.",
            ];
        }
    }

    // busiest machine
    $top = $usage[0];
    if ($top['status'] === 'busy') {
        $insights[] = [
            'level'   => 'info',
            'machine' => $top['name'],
            'message' => "{$top['name']} was the busiest machine with {$top['sessions']} sessions ({$top['share_pct']}% of all sessions).",
        ];
    }

    $has_warning = count(array_filter($insights, fn($i) => $i['level'] === 'warning')) > 0;
    if (!$has_warning) {
        array_unshift($insights, [
            'level'   => 'good',
            'machine' => null,
            'message' => 'Usage is fairly even across all machines in this period.',
        ]);
    }
}

$machine_usage = [
    'machines'       => $usage,
    'insights'       => $insights,
    'enough_data'    => $enough_data,
    'total_sessions' => $total_sessions,
    'avg_sessions'   => $machine_count > 0 ? round($total_sessions / $machine_count, 1) : 0,
];

respond(true, [
    'period' => [
        'mode'           => $mode,
        'label'          => range_label($mode, $start, $end),
        'prev_label'     => range_label($mode, $prev_start, $prev_end),
        'in_progress'    => $in_progress,
        'compared_until' => $prev_cmp_end->format('M j, g:i A'),
    ],
    'current'        => $current,
    'previous'       => $previous,
    'previous_full'  => $previous_full,
    'chart'          => $chart,
    'coin_breakdown' => $coin_breakdown,
    'peak_hours'     => $peak_hours,
    'top_machines'   => $top_machines,
    'machine_usage'  => $machine_usage,
], 'OK');