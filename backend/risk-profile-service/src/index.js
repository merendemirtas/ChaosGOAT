const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT || 4005);

const app = express();
app.use(cors());
app.use(express.json());

const profiles = {
  acc_1001: {
    accountId: "acc_1001",
    customerTier: "standard",
    riskBand: "LOW"
  },
  acc_2002: {
    accountId: "acc_2002",
    customerTier: "watch",
    riskBand: "MEDIUM"
  }
};

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

async function applyRequestChaos() {
  requestCounter += 1;

  if (chaosState.latencyMs > 0) {
    await sleep(chaosState.latencyMs);
  }

  if (chaosState.cpuStressMs > 0) {
    busyLoop(chaosState.cpuStressMs);
  }

  if (chaosState.memoryStressMb > 0) {
    retainedMemory = [Buffer.alloc(chaosState.memoryStressMb * 1024 * 1024, 3)];
  } else {
    retainedMemory = [];
  }

  if (chaosState.mode === "packet_loss" && Math.random() < chaosState.packetLossRate) {
    const error = new Error("Simulated packet loss in risk-profile-service.");
    error.statusCode = 504;
    throw error;
  }

  if (chaosState.mode === "partial_failure") {
    const shouldFail =
      chaosState.partialFailurePattern === "alternate"
        ? requestCounter % 2 === 0
        : Math.random() < chaosState.partialFailureRate;

    if (shouldFail) {
      const error = new Error("Simulated partial failure in risk-profile-service.");
      error.statusCode = 503;
      throw error;
    }
  }
}

app.get("/health", (_req, res) => {
  const status =
    chaosState.mode === "cache_disconnect"
      ? "DEGRADED"
      : ["network_delay", "packet_loss", "cpu_stress", "memory_stress", "partial_failure"].includes(
            chaosState.mode
          )
        ? "DEGRADED"
        : "UP";

  res.json({
    service: "risk-profile-service",
    status,
    dependency: "internal-risk-cache",
    dependencyStatus: chaosState.mode === "cache_disconnect" ? "DOWN" : "UP",
    chaosMode: chaosState.mode
  });
});

app.get("/risk-profile/:accountId", async (req, res) => {
  try {
    await applyRequestChaos();

    const accountId = req.params.accountId || "acc_1001";
    const profile = profiles[accountId] || profiles.acc_1001;

    if (chaosState.mode === "cache_disconnect") {
      await sleep(700);
      return res.json({
        ...profile,
        source: "fallback-risk-store",
        cacheStatus: "DISCONNECTED",
        degraded: true
      });
    }

    return res.json({
      ...profile,
      source: "risk-cache",
      cacheStatus: "CONNECTED"
    });
  } catch (error) {
    return res.status(error.statusCode || 503).json({
      service: "risk-profile-service",
      status: "DEGRADED",
      message: error.message
    });
  }
});

app.get("/chaos", (_req, res) => {
  res.json({
    service: "risk-profile-service",
    chaos: chaosState
  });
});

app.post("/chaos/configure", (req, res) => {
  chaosState = normalizeChaosConfig(req.body);

  res.json({
    service: "risk-profile-service",
    chaos: chaosState,
    status: "configured"
  });
});

app.post("/chaos/reset", (_req, res) => {
  chaosState = buildDefaultChaosState();
  retainedMemory = [];

  res.json({
    service: "risk-profile-service",
    chaos: chaosState,
    status: "reset"
  });
});

app.listen(PORT, () => {
  console.log(`[risk-profile-service] listening on port ${PORT}`);
});
