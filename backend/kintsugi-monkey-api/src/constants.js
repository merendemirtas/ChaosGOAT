const SERVICE_REGISTRY = [
  {
    name: "account-service",
    url: process.env.ACCOUNT_SERVICE_URL || "http://account-service:4001",
    healthPath: "/health",
    controlPath: "/chaos",
    criticality: "HIGH",
    containerName: "kintsugi-account-service"
  },
  {
    name: "transaction-service",
    url: process.env.TRANSACTION_SERVICE_URL || "http://transaction-service:4002",
    healthPath: "/health",
    criticality: "HIGH",
    containerName: "kintsugi-transaction-service"
  },
  {
    name: "fraud-check-service",
    url: process.env.FRAUD_CHECK_SERVICE_URL || "http://fraud-check-service:4003",
    healthPath: "/health",
    controlPath: "/chaos",
    criticality: "HIGH",
    containerName: "kintsugi-fraud-check-service"
  },
  {
    name: "notification-service",
    url: process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:4004",
    healthPath: "/health",
    criticality: "LOW",
    containerName: "kintsugi-notification-service"
  },
  {
    name: "risk-profile-service",
    url: process.env.RISK_PROFILE_SERVICE_URL || "http://risk-profile-service:4005",
    healthPath: "/health",
    controlPath: "/chaos",
    criticality: "MEDIUM",
    containerName: "kintsugi-risk-profile-service"
  },
  {
    name: "limit-service",
    url: process.env.LIMIT_SERVICE_URL || "http://limit-service:4006",
    healthPath: "/health",
    controlPath: "/chaos",
    criticality: "HIGH",
    containerName: "kintsugi-limit-service"
  },
  {
    name: "beneficiary-service",
    url: process.env.BENEFICIARY_SERVICE_URL || "http://beneficiary-service:4007",
    healthPath: "/health",
    controlPath: "/chaos",
    criticality: "HIGH",
    containerName: "kintsugi-beneficiary-service"
  },
  {
    name: "compliance-service",
    url: process.env.COMPLIANCE_SERVICE_URL || "http://compliance-service:4008",
    healthPath: "/health",
    controlPath: "/chaos",
    criticality: "HIGH",
    containerName: "kintsugi-compliance-service"
  }
];

const SERVICE_DEPENDENCIES = [
  { from: "transaction-service", to: "fraud-check-service", label: "fraud runtime dependency" },
  { from: "transaction-service", to: "limit-service", label: "limit runtime dependency" },
  {
    from: "transaction-service",
    to: "beneficiary-service",
    label: "beneficiary validation dependency"
  },
  {
    from: "transaction-service",
    to: "compliance-service",
    label: "compliance approval dependency"
  },
  { from: "transaction-service", to: "notification-service", label: "notification side effect" },
  { from: "fraud-check-service", to: "risk-profile-service", label: "risk profile lookup" },
  { from: "limit-service", to: "account-service", label: "account lookup" },
  { from: "beneficiary-service", to: "account-service", label: "beneficiary account lookup" },
  { from: "compliance-service", to: "account-service", label: "compliance account lookup" }
];

const CHAOS_METHODS = [
  {
    code: "service_kill",
    label: "Service Kill",
    category: "availability",
    description: "Stops a container entirely and observes upstream fallback behavior.",
    supportedTargets: [
      "fraud-check-service",
      "risk-profile-service",
      "limit-service",
      "account-service",
      "beneficiary-service",
      "compliance-service"
    ]
  },
  {
    code: "network_delay",
    label: "Network Delay",
    category: "latency",
    description: "Injects controlled response latency into a service to test timeout and fallback handling.",
    supportedTargets: [
      "fraud-check-service",
      "risk-profile-service",
      "limit-service",
      "account-service",
      "beneficiary-service",
      "compliance-service"
    ]
  },
  {
    code: "packet_loss",
    label: "Packet Loss",
    category: "network_reliability",
    description: "Randomly drops requests in the target service to simulate flaky connectivity.",
    supportedTargets: [
      "fraud-check-service",
      "risk-profile-service",
      "limit-service",
      "account-service",
      "beneficiary-service",
      "compliance-service"
    ]
  },
  {
    code: "cpu_stress",
    label: "CPU Stress",
    category: "resource_pressure",
    description: "Burns CPU cycles per request to simulate saturated compute conditions.",
    supportedTargets: [
      "fraud-check-service",
      "risk-profile-service",
      "limit-service",
      "account-service",
      "beneficiary-service",
      "compliance-service"
    ]
  },
  {
    code: "memory_stress",
    label: "Memory Stress",
    category: "resource_pressure",
    description: "Allocates extra memory during requests to simulate memory pressure symptoms.",
    supportedTargets: [
      "fraud-check-service",
      "risk-profile-service",
      "limit-service",
      "account-service",
      "beneficiary-service",
      "compliance-service"
    ]
  },
  {
    code: "db_disconnect",
    label: "DB Disconnect",
    category: "dependency_loss",
    description: "Disconnects the simulated account datastore behind account-service.",
    supportedTargets: ["account-service"]
  },
  {
    code: "cache_disconnect",
    label: "Cache Disconnect",
    category: "dependency_loss",
    description: "Disconnects the simulated risk cache and forces a slower fallback path.",
    supportedTargets: ["risk-profile-service"]
  },
  {
    code: "traffic_surge",
    label: "Traffic Surge",
    category: "load",
    description: "Fires a burst of concurrent transactions to measure queueing and degradation behavior.",
    supportedTargets: ["transaction-service"]
  },
  {
    code: "partial_failure",
    label: "Partial Failure",
    category: "partial_outage",
    description: "Makes some requests fail or slow down while other instances still appear healthy.",
    supportedTargets: [
      "fraud-check-service",
      "risk-profile-service",
      "limit-service",
      "account-service",
      "beneficiary-service",
      "compliance-service"
    ]
  }
];

const SAFE_DEGRADATION_MESSAGE =
  "Transactions moved to pending manual review instead of auto-approval.";

const CHAOS_DEFAULT_CONFIG = {
  latencyMs: 1200,
  packetLossRate: 0.35,
  cpuStressMs: 450,
  memoryStressMb: 48,
  partialFailureRate: 0.7,
  partialFailurePattern: "alternate",
  requestCount: 12,
  concurrency: 6
};

const CRITICALITY_WEIGHTS = {
  LOW: 0.35,
  MEDIUM: 0.65,
  HIGH: 1
};

module.exports = {
  CHAOS_DEFAULT_CONFIG,
  CHAOS_METHODS,
  CRITICALITY_WEIGHTS,
  SAFE_DEGRADATION_MESSAGE,
  SERVICE_DEPENDENCIES,
  SERVICE_REGISTRY
};
