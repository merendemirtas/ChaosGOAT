const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { SERVICE_DEPENDENCIES, SERVICE_REGISTRY } = require("./constants");

const DATABASE_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "kintsugi-monkey.db");

let databasePromise;

async function getDb() {
  if (!databasePromise) {
    fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

    databasePromise = open({
      filename: DATABASE_PATH,
      driver: sqlite3.Database
    });
  }

  return databasePromise;
}

async function ensureColumn(tableName, columnName, definition) {
  const db = await getDb();
  const columns = await db.all(`PRAGMA table_info(${tableName})`);

  if (!columns.some((column) => column.name === columnName)) {
    await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function initDb() {
  const db = await getDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      criticality TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_service TEXT NOT NULL,
      target_service TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chaos_experiments (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      target_service TEXT NOT NULL,
      affected_service TEXT NOT NULL,
      target_services_json TEXT,
      fault_type TEXT NOT NULL,
      chaos_method_category TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      recovery_time_ms INTEGER,
      safe_degradation TEXT,
      chaos_config_json TEXT,
      affected_services_json TEXT,
      request_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      degraded_count INTEGER DEFAULT 0,
      average_latency_ms REAL DEFAULT 0,
      p95_latency_ms REAL DEFAULT 0,
      peak_latency_ms REAL DEFAULT 0,
      risk_score REAL DEFAULT 0,
      risk_level TEXT DEFAULT 'LOW',
      risk_metrics_json TEXT,
      impact_chain_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms REAL NOT NULL,
      error_count INTEGER NOT NULL,
      degraded_count INTEGER NOT NULL,
      failed_requests INTEGER NOT NULL,
      fallback_used INTEGER NOT NULL,
      success_count INTEGER DEFAULT 0,
      packet_loss_count INTEGER DEFAULT 0,
      timeout_count INTEGER DEFAULT 0,
      notes_json TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (experiment_id) REFERENCES chaos_experiments(id)
    );

    CREATE TABLE IF NOT EXISTS incident_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (experiment_id) REFERENCES chaos_experiments(id)
    );

    CREATE TABLE IF NOT EXISTS golden_traces (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      chaos_method_classification TEXT,
      summary TEXT NOT NULL,
      suspected_weak_point TEXT NOT NULL,
      blast_radius TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      risk_score REAL DEFAULT 0,
      risk_level_reasoning TEXT,
      safe_degradation_review TEXT NOT NULL,
      developer_recommendations_json TEXT NOT NULL,
      next_experiments_json TEXT NOT NULL,
      risk_metrics_json TEXT,
      kintsugi_lesson TEXT NOT NULL,
      translated_to TEXT DEFAULT 'en',
      raw_ai_response TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (experiment_id) REFERENCES chaos_experiments(id)
    );
  `);

  await ensureColumn("chaos_experiments", "chaos_method_category", "TEXT");
  await ensureColumn("chaos_experiments", "target_services_json", "TEXT");
  await ensureColumn("chaos_experiments", "chaos_config_json", "TEXT");
  await ensureColumn("chaos_experiments", "affected_services_json", "TEXT");
  await ensureColumn("chaos_experiments", "request_count", "INTEGER DEFAULT 0");
  await ensureColumn("chaos_experiments", "success_count", "INTEGER DEFAULT 0");
  await ensureColumn("chaos_experiments", "failed_count", "INTEGER DEFAULT 0");
  await ensureColumn("chaos_experiments", "degraded_count", "INTEGER DEFAULT 0");
  await ensureColumn("chaos_experiments", "average_latency_ms", "REAL DEFAULT 0");
  await ensureColumn("chaos_experiments", "p95_latency_ms", "REAL DEFAULT 0");
  await ensureColumn("chaos_experiments", "peak_latency_ms", "REAL DEFAULT 0");
  await ensureColumn("chaos_experiments", "risk_score", "REAL DEFAULT 0");
  await ensureColumn("chaos_experiments", "risk_level", "TEXT DEFAULT 'LOW'");
  await ensureColumn("chaos_experiments", "risk_metrics_json", "TEXT");
  await ensureColumn("chaos_experiments", "impact_chain_json", "TEXT");

  await ensureColumn("service_metrics", "success_count", "INTEGER DEFAULT 0");
  await ensureColumn("service_metrics", "packet_loss_count", "INTEGER DEFAULT 0");
  await ensureColumn("service_metrics", "timeout_count", "INTEGER DEFAULT 0");
  await ensureColumn("service_metrics", "notes_json", "TEXT");

  await ensureColumn("golden_traces", "chaos_method_classification", "TEXT");
  await ensureColumn("golden_traces", "risk_score", "REAL DEFAULT 0");
  await ensureColumn("golden_traces", "risk_level_reasoning", "TEXT");
  await ensureColumn("golden_traces", "risk_metrics_json", "TEXT");
  await ensureColumn("golden_traces", "translated_to", "TEXT DEFAULT 'en'");

  const now = new Date().toISOString();
  for (const service of SERVICE_REGISTRY) {
    await db.run(
      `
        INSERT INTO services (name, status, criticality, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          criticality = excluded.criticality,
          updated_at = excluded.updated_at
      `,
      [service.name, "UNKNOWN", service.criticality, now, now]
    );
  }

  for (const dependency of SERVICE_DEPENDENCIES) {
    await db.run(
      `
        INSERT INTO service_dependencies (source_service, target_service, label, created_at)
        SELECT ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM service_dependencies
          WHERE source_service = ? AND target_service = ? AND label = ?
        )
      `,
      [
        dependency.from,
        dependency.to,
        dependency.label,
        now,
        dependency.from,
        dependency.to,
        dependency.label
      ]
    );
  }
}

async function upsertServiceStatus(name, status, criticality = "MEDIUM") {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.run(
    `
      INSERT INTO services (name, status, criticality, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        status = excluded.status,
        criticality = excluded.criticality,
        updated_at = excluded.updated_at
    `,
    [name, status, criticality, now, now]
  );
}

async function createExperiment(experiment) {
  const db = await getDb();

  await db.run(
    `
      INSERT INTO chaos_experiments (
        id,
        domain,
        target_service,
        affected_service,
        target_services_json,
        fault_type,
        chaos_method_category,
        status,
        started_at,
        ended_at,
        recovery_time_ms,
        safe_degradation,
        chaos_config_json,
        affected_services_json,
        request_count,
        success_count,
        failed_count,
        degraded_count,
        average_latency_ms,
        p95_latency_ms,
        peak_latency_ms,
        risk_score,
        risk_level,
        risk_metrics_json,
        impact_chain_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      experiment.id,
      experiment.domain,
      experiment.target_service,
      experiment.affected_service,
      stringifyJson(experiment.target_services),
      experiment.fault_type,
      experiment.chaos_method_category || null,
      experiment.status,
      experiment.started_at,
      experiment.ended_at || null,
      experiment.recovery_time_ms || null,
      experiment.safe_degradation || null,
      stringifyJson(experiment.chaos_config),
      stringifyJson(experiment.affected_services),
      experiment.request_count || 0,
      experiment.success_count || 0,
      experiment.failed_count || 0,
      experiment.degraded_count || 0,
      experiment.average_latency_ms || 0,
      experiment.p95_latency_ms || 0,
      experiment.peak_latency_ms || 0,
      experiment.risk_score || 0,
      experiment.risk_level || "LOW",
      stringifyJson(experiment.risk_metrics),
      stringifyJson(experiment.impact_chain),
      experiment.created_at
    ]
  );
}

async function updateExperiment(id, updates) {
  const db = await getDb();
  const current = await db.get(`SELECT * FROM chaos_experiments WHERE id = ?`, [id]);

  if (!current) {
    return null;
  }

  const merged = { ...mapExperimentRow(current), ...updates };

  await db.run(
    `
      UPDATE chaos_experiments
      SET domain = ?,
          target_service = ?,
          affected_service = ?,
          target_services_json = ?,
          fault_type = ?,
          chaos_method_category = ?,
          status = ?,
          started_at = ?,
          ended_at = ?,
          recovery_time_ms = ?,
          safe_degradation = ?,
          chaos_config_json = ?,
          affected_services_json = ?,
          request_count = ?,
          success_count = ?,
          failed_count = ?,
          degraded_count = ?,
          average_latency_ms = ?,
          p95_latency_ms = ?,
          peak_latency_ms = ?,
          risk_score = ?,
          risk_level = ?,
          risk_metrics_json = ?,
          impact_chain_json = ?,
          created_at = ?
      WHERE id = ?
    `,
    [
      merged.domain,
      merged.target_service,
      merged.affected_service,
      stringifyJson(merged.target_services),
      merged.fault_type,
      merged.chaos_method_category || null,
      merged.status,
      merged.started_at,
      merged.ended_at || null,
      merged.recovery_time_ms || null,
      merged.safe_degradation || null,
      stringifyJson(merged.chaos_config),
      stringifyJson(merged.affected_services),
      merged.request_count || 0,
      merged.success_count || 0,
      merged.failed_count || 0,
      merged.degraded_count || 0,
      merged.average_latency_ms || 0,
      merged.p95_latency_ms || 0,
      merged.peak_latency_ms || 0,
      merged.risk_score || 0,
      merged.risk_level || "LOW",
      stringifyJson(merged.risk_metrics),
      stringifyJson(merged.impact_chain),
      merged.created_at,
      id
    ]
  );

  return getExperimentById(id);
}

async function addServiceMetric(metric) {
  const db = await getDb();

  await db.run(
    `
      INSERT INTO service_metrics (
        experiment_id,
        service_name,
        status,
        latency_ms,
        error_count,
        degraded_count,
        failed_requests,
        fallback_used,
        success_count,
        packet_loss_count,
        timeout_count,
        notes_json,
        timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      metric.experiment_id,
      metric.service_name,
      metric.status,
      metric.latency_ms,
      metric.error_count,
      metric.degraded_count,
      metric.failed_requests,
      metric.fallback_used ? 1 : 0,
      metric.success_count || 0,
      metric.packet_loss_count || 0,
      metric.timeout_count || 0,
      stringifyJson(metric.notes),
      metric.timestamp
    ]
  );
}

async function addIncidentLog(log) {
  const db = await getDb();

  await db.run(
    `
      INSERT INTO incident_logs (
        experiment_id,
        level,
        message,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      log.experiment_id,
      log.level,
      log.message,
      stringifyJson(log.metadata_json),
      log.created_at
    ]
  );
}

async function addGoldenTrace(trace) {
  const db = await getDb();

  await db.run(
    `
      INSERT INTO golden_traces (
        id,
        experiment_id,
        chaos_method_classification,
        summary,
        suspected_weak_point,
        blast_radius,
        risk_level,
        risk_score,
        risk_level_reasoning,
        safe_degradation_review,
        developer_recommendations_json,
        next_experiments_json,
        risk_metrics_json,
        kintsugi_lesson,
        translated_to,
        raw_ai_response,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      trace.id,
      trace.experiment_id,
      trace.chaos_method_classification || null,
      trace.summary,
      trace.suspected_weak_point,
      trace.blast_radius,
      trace.risk_level,
      trace.risk_score || 0,
      trace.risk_level_reasoning || null,
      trace.safe_degradation_review,
      stringifyJson(trace.developer_recommendations),
      stringifyJson(trace.next_experiments),
      stringifyJson(trace.risk_metrics),
      trace.kintsugi_lesson,
      trace.translated_to || "en",
      trace.raw_ai_response || null,
      trace.created_at
    ]
  );
}

async function getLatestRunningExperiment() {
  const db = await getDb();
  const row = await db.get(
    `
      SELECT *
      FROM chaos_experiments
      WHERE status = 'running'
      ORDER BY datetime(started_at) DESC
      LIMIT 1
    `
  );

  return row ? mapExperimentRow(row) : null;
}

async function listExperiments() {
  const db = await getDb();
  const rows = await db.all(
    `
      SELECT *
      FROM chaos_experiments
      ORDER BY datetime(created_at) DESC
    `
  );

  return rows.map(mapExperimentRow);
}

async function getExperimentById(id) {
  const db = await getDb();
  const row = await db.get(`SELECT * FROM chaos_experiments WHERE id = ?`, [id]);
  return row ? mapExperimentRow(row) : null;
}

async function getExperimentDetail(id) {
  const db = await getDb();
  const experiment = await getExperimentById(id);

  if (!experiment) {
    return null;
  }

  const metrics = await db.all(
    `
      SELECT *
      FROM service_metrics
      WHERE experiment_id = ?
      ORDER BY datetime(timestamp) DESC
    `,
    [id]
  );

  const logs = await db.all(
    `
      SELECT *
      FROM incident_logs
      WHERE experiment_id = ?
      ORDER BY datetime(created_at) DESC
    `,
    [id]
  );

  return {
    ...experiment,
    metrics: metrics.map(mapServiceMetricRow),
    logs: logs.map((log) => ({
      ...log,
      metadata_json: parseJson(log.metadata_json, null)
    }))
  };
}

async function listGoldenTraces() {
  const db = await getDb();
  const rows = await db.all(
    `
      SELECT *
      FROM golden_traces
      ORDER BY datetime(created_at) DESC
    `
  );

  return rows.map(mapGoldenTraceRow);
}

async function getGoldenTraceById(id) {
  const db = await getDb();
  const row = await db.get(`SELECT * FROM golden_traces WHERE id = ?`, [id]);
  return row ? mapGoldenTraceRow(row) : null;
}

function stringifyJson(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function mapExperimentRow(row) {
  return {
    ...row,
    target_services: parseJson(row.target_services_json, []),
    chaos_config: parseJson(row.chaos_config_json, {}),
    affected_services: parseJson(row.affected_services_json, []),
    risk_metrics: parseJson(row.risk_metrics_json, []),
    impact_chain: parseJson(row.impact_chain_json, []),
    metric_summary: {
      requestCount: Number(row.request_count || 0),
      successfulRequests: Number(row.success_count || 0),
      failedRequests: Number(row.failed_count || 0),
      degradedRequests: Number(row.degraded_count || 0),
      averageLatencyMs: Number(row.average_latency_ms || 0),
      p95LatencyMs: Number(row.p95_latency_ms || 0),
      peakLatencyMs: Number(row.peak_latency_ms || 0)
    }
  };
}

function mapServiceMetricRow(row) {
  return {
    ...row,
    fallback_used: Boolean(row.fallback_used),
    notes: parseJson(row.notes_json, {})
  };
}

function mapGoldenTraceRow(row) {
  const {
    developer_recommendations_json,
    next_experiments_json: _nextExperimentsJson,
    risk_metrics_json,
    kintsugi_lesson: _kintsugiLesson,
    ...rest
  } = row;

  return {
    ...rest,
    developer_recommendations: parseJson(developer_recommendations_json, []),
    risk_metrics: parseJson(risk_metrics_json, [])
  };
}

module.exports = {
  addGoldenTrace,
  addIncidentLog,
  addServiceMetric,
  createExperiment,
  getDb,
  getExperimentById,
  getExperimentDetail,
  getGoldenTraceById,
  getLatestRunningExperiment,
  initDb,
  listExperiments,
  listGoldenTraces,
  updateExperiment,
  upsertServiceStatus
};
