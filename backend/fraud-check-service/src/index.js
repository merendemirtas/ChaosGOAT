const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT || 4003);
const RISK_PROFILE_SERVICE_URL =
  process.env.RISK_PROFILE_SERVICE_URL || "http://risk-profile-service:4005";

const app = express();
app.use(cors());
app.use(express.json());

let requestCounter = 0;
let retainedMemory = [];
let chaosState = buildDefaultChaosState();

function buildDefaultChaosState() {
  return {
    mode: "none",
    latencyMs: 0,
    packetLossRate: 0,
    cpuStressMs: 0,
    memoryStressMb: 0,
    partialFailureRate: 0.5,
    partialFailurePattern: "alternate"
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function busyLoop(ms) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ms) {
    Math.sqrt(Math.random() * 1000);
  }
}

function normalizeChaosConfig(input = {}) {
  return {
    mode: String(input.mode || "none"),
    latencyMs: Number(input.latencyMs || 0),
    packetLossRate: Math.min(1, Math.max(0, Number(input.packetLossRate || 0))),
    cpuStressMs: Number(input.cpuStressMs || 0),
    memoryStressMb: Number(input.memoryStressMb || 0),
    partialFailureRate: Math.min(1, Math.max(0, Number(input.partialFailureRate || 0.5))),
    partialFailurePattern: String(input.partialFailurePattern || "alternate")
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 2000);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function applyRequestChaos() {
  requestCounter += 1;

  if (chaosState.latencyMs > 0) {
    await sleep(chaosState.latencyMs);
  }

  if (chaosState.cpuStressMs > 0) {
    busyLoop(chaosState.cpuStressMs);
  }

  if (chaosState.memoryStressMb > 0) {
    retainedMemory = [Buffer.alloc(chaosState.memoryStressMb * 1024 * 1024, 5)];
  } else {
    retainedMemory = [];
  }

  if (chaosState.mode === "packet_loss" && Math.random() < chaosState.packetLossRate) {
    const error = new Error("Simulated packet loss in fraud-check-service.");
    error.statusCode = 504;
    throw error;
  }

  if (chaosState.mode === "partial_failure") {
    const shouldFail =
      chaosState.partialFailurePattern === "alternate"
        ? requestCounter % 2 === 0
        : Math.random() < chaosState.partialFailureRate;

    if (shouldFail) {
      const error = new Error("Simulated partial failure in fraud-check-service.");
      error.statusCode = 503;
      throw error;
    }
  }
}

async function getRiskProfileHealth() {
  try {
    const payload = await fetchJson(`${RISK_PROFILE_SERVICE_URL}/health`, { timeoutMs: 1500 });
    return payload.status || "UP";
  } catch (_error) {
    return "DOWN";
  }
}

function deriveRiskLabel(amount, customerTier) {
  if (amount > 10000 || customerTier === "watch") {
    return "MEDIUM";
  }

  return "LOW";
}

app.get("/health", async (_req, res) => {
  const dependencyStatus = await getRiskProfileHealth();
  const status =
    dependencyStatus === "DOWN" ||
    ["network_delay", "packet_loss", "cpu_stress", "memory_stress", "partial_failure"].includes(
      chaosState.mode
    )
      ? "DEGRADED"
      : "UP";

  res.json({
    service: "fraud-check-service",
    status,
    dependency: "risk-profile-service",
    dependencyStatus,
    chaosMode: chaosState.mode
  });
});

app.post("/fraud/check", async (req, res) => {
  const { transactionId, amount, fromAccount, toAccount } = req.body || {};

  try {
    await applyRequestChaos();

    const profile = await fetchJson(
      `${RISK_PROFILE_SERVICE_URL}/risk-profile/${encodeURIComponent(fromAccount || "acc_1001")}`,
      { timeoutMs: 2500 }
    );

    const risk = deriveRiskLabel(amount, profile.customerTier);

    return res.json({
      transactionId: transactionId || `txn_${Date.now()}`,
      risk,
      approved: true,
      fromAccount: fromAccount || "acc_1001",
      toAccount: toAccount || "acc_2002",
      profileRisk: profile.riskBand,
      profileSource: profile.source,
      cacheStatus: profile.cacheStatus || "CONNECTED"
    });
  } catch (error) {
    return res.status(error.statusCode || 503).json({
      transactionId: transactionId || `txn_${Date.now()}`,
      approved: false,
      message: error.message,
      degraded: true
    });
  }
});

app.get("/chaos", (_req, res) => {
  res.json({
    service: "fraud-check-service",
    chaos: chaosState
  });
});

app.post("/chaos/configure", (req, res) => {
  chaosState = normalizeChaosConfig(req.body);

  res.json({
    service: "fraud-check-service",
    chaos: chaosState,
    status: "configured"
  });
});

app.post("/chaos/reset", (_req, res) => {
  chaosState = buildDefaultChaosState();
  retainedMemory = [];

  res.json({
    service: "fraud-check-service",
    chaos: chaosState,
    status: "reset"
  });
});

app.listen(PORT, () => {
  console.log(`[fraud-check-service] listening on port ${PORT}`);
});
