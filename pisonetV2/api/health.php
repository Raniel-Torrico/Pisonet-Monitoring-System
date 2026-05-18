<?php
// health.php
// Analyzes the metrics history for each machine and returns:
// - A health score from 0 to 100
// - A status: Healthy, Needs Attention, or Critical
// - Specific maintenance recommendations based on the data

require_once __DIR__ . '/../db/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(false, null, 'Method not allowed', 405);
}

validate_api_key();

// Get all machines
$machines = db_select(
    $conn,
    'SELECT name, cpu, ram, disk, last_seen, created_at FROM machines ORDER BY name ASC'
);

$results = [];

foreach ($machines as $machine) {
    $name  = $machine['name'];
    $score = 100; // start at perfect health, deduct points for issues
    $recommendations = [];
    $warnings        = [];

    // ── Average CPU over last 7 days ──────────────────────────────────────────
    $cpu_avg = db_select(
        $conn,
        'SELECT ROUND(AVG(cpu), 1) AS avg_cpu, ROUND(MAX(cpu), 1) AS max_cpu
         FROM metrics
         WHERE machine_name = ?
         AND recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY)',
        's',
        [$name]
    );

    $avg_cpu = (float) ($cpu_avg[0]['avg_cpu'] ?? 0);
    $max_cpu = (float) ($cpu_avg[0]['max_cpu'] ?? 0);

    if ($avg_cpu >= 80) {
        $score -= 25;
        $recommendations[] = [
            'component' => 'CPU',
            'level'     => 'critical',
            'message'   => "Average CPU is {$avg_cpu}% over 7 days — clean the CPU fan or check for thermal paste degradation",
        ];
    } elseif ($avg_cpu >= 60) {
        $score -= 10;
        $recommendations[] = [
            'component' => 'CPU',
            'level'     => 'warning',
            'message'   => "Average CPU is {$avg_cpu}% over 7 days — monitor for overheating, consider cleaning dust",
        ];
    }

    if ($max_cpu >= 95) {
        $score -= 10;
        $warnings[] = "CPU hit {$max_cpu}% peak in the last 7 days";
    }

    // ── Average RAM over last 7 days ──────────────────────────────────────────
    $ram_avg = db_select(
        $conn,
        'SELECT ROUND(AVG(ram), 1) AS avg_ram, ROUND(MAX(ram), 1) AS max_ram
         FROM metrics
         WHERE machine_name = ?
         AND recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY)',
        's',
        [$name]
    );

    $avg_ram = (float) ($ram_avg[0]['avg_ram'] ?? 0);
    $max_ram = (float) ($ram_avg[0]['max_ram'] ?? 0);

    if ($avg_ram >= 85) {
        $score -= 20;
        $recommendations[] = [
            'component' => 'RAM',
            'level'     => 'critical',
            'message'   => "Average RAM usage is {$avg_ram}% — consider upgrading RAM or reducing background programs",
        ];
    } elseif ($avg_ram >= 70) {
        $score -= 10;
        $recommendations[] = [
            'component' => 'RAM',
            'level'     => 'warning',
            'message'   => "Average RAM usage is {$avg_ram}% — monitor closely, may need upgrade soon",
        ];
    }

    // ── Disk usage ────────────────────────────────────────────────────────────
    $disk_avg = db_select(
        $conn,
        'SELECT ROUND(AVG(disk), 1) AS avg_disk
         FROM metrics
         WHERE machine_name = ?
         AND recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY)',
        's',
        [$name]
    );

    $avg_disk = (float) ($disk_avg[0]['avg_disk'] ?? 0);

    if ($avg_disk >= 90) {
        $score -= 25;
        $recommendations[] = [
            'component' => 'Storage',
            'level'     => 'critical',
            'message'   => "Disk usage is at {$avg_disk}% — clean up files immediately or replace with larger storage",
        ];
    } elseif ($avg_disk >= 75) {
        $score -= 10;
        $recommendations[] = [
            'component' => 'Storage',
            'level'     => 'warning',
            'message'   => "Disk usage is at {$avg_disk}% — consider cleaning up old files or upgrading storage",
        ];
    }

    // ── Uptime check ──────────────────────────────────────────────────────────
    // Long uptime without reboot can cause instability
    $uptime_data = db_select(
        $conn,
        'SELECT MAX(uptime) AS max_uptime
         FROM metrics
         WHERE machine_name = ?
         AND recorded_at > DATE_SUB(NOW(), INTERVAL 1 DAY)',
        's',
        [$name]
    );

    $uptime_seconds = (int) ($uptime_data[0]['max_uptime'] ?? 0);
    $uptime_days    = round($uptime_seconds / 86400, 1);

    if ($uptime_days >= 14) {
        $score -= 15;
        $recommendations[] = [
            'component' => 'System',
            'level'     => 'warning',
            'message'   => "PC has been running for {$uptime_days} days without a restart — schedule a reboot for stability",
        ];
    } elseif ($uptime_days >= 7) {
        $score -= 5;
        $recommendations[] = [
            'component' => 'System',
            'level'     => 'info',
            'message'   => "PC has been running for {$uptime_days} days — consider restarting soon",
        ];
    }

    // ── Offline frequency check ───────────────────────────────────────────────
    // How many times did this machine go offline in the last 7 days?
    $offline_count = db_select(
        $conn,
        'SELECT COUNT(*) AS cnt
         FROM alerts
         WHERE machine_name = ? AND type = "offline"
         AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)',
        's',
        [$name]
    );

    $offline_times = (int) ($offline_count[0]['cnt'] ?? 0);

    if ($offline_times >= 5) {
        $score -= 20;
        $recommendations[] = [
            'component' => 'Network / Power',
            'level'     => 'critical',
            'message'   => "Machine went offline {$offline_times} times in 7 days — check network cable, power supply, or OS stability",
        ];
    } elseif ($offline_times >= 2) {
        $score -= 10;
        $recommendations[] = [
            'component' => 'Network / Power',
            'level'     => 'warning',
            'message'   => "Machine went offline {$offline_times} times in 7 days — monitor for connection or power issues",
        ];
    }

    // ── Clamp score between 0 and 100 ─────────────────────────────────────────
    $score = max(0, min(100, $score));

    // ── Determine status label ────────────────────────────────────────────────
    if ($score >= 80) {
        $status = 'healthy';
        $status_label = 'Healthy';
    } elseif ($score >= 50) {
        $status = 'attention';
        $status_label = 'Needs Attention';
    } else {
        $status = 'critical';
        $status_label = 'Critical';
    }

    // ── If no issues found, add a positive message ────────────────────────────
    if (empty($recommendations)) {
        $recommendations[] = [
            'component' => 'All Components',
            'level'     => 'good',
            'message'   => 'No issues detected — all components are within normal range',
        ];
    }

    $results[] = [
        'machine_name'    => $name,
        'score'           => $score,
        'status'          => $status,
        'status_label'    => $status_label,
        'avg_cpu'         => $avg_cpu,
        'avg_ram'         => $avg_ram,
        'avg_disk'        => $avg_disk,
        'uptime_days'     => $uptime_days,
        'offline_count'   => $offline_times,
        'warnings'        => $warnings,
        'recommendations' => $recommendations,
    ];
}

respond(true, ['health' => $results], 'OK');
