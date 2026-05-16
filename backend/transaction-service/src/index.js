const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT || 4002);
const FRAUD_CHECK_SERVICE_URL =
  process.env.FRAUD_CHECK_SERVICE_URL || "http://fraud-check-service:4003";
const LIMIT_SERVICE_URL = process.env.LIMIT_SERVICE_URL || "http://limit-service:4006";
const BENEFICIARY_SERVICE_URL =
  process.env.BENEFICIARY_SERVICE_URL || "http://beneficiary-service:4007";
const COMPLIANCE_SERVICE_URL =
  process.env.COMPLIANCE_SERVICE_URL || "http://compliance-service:4008";
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:4004";

const app = express();
app.use(cors());
app.use(express.json());

let transactionCounter = 1000;

function nextTransactionId() {
  transactionCounter += 1;
  return `txn_${transactionCounter}`;
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

async function getDependencyHealth(url) {
  try {
    const payload = await fetchJson(`${url}/health`, { timeoutMs: 1500 });
    return payload.status || "UP";
  } catch (_error) {
    return "DOWN";
  }
}

app.get("/health", async (_req, res) => {
  const [fraudStatus, limitStatus, beneficiaryStatus, complianceStatus, notificationStatus] =
    await Promise.all([
    getDependencyHealth(FRAUD_CHECK_SERVICE_URL),
    getDependencyHealth(LIMIT_SERVICE_URL),
    getDependencyHealth(BENEFICIARY_SERVICE_URL),
    getDependencyHealth(COMPLIANCE_SERVICE_URL),
    getDependencyHealth(NOTIFICATION_SERVICE_URL)
  ]);
  const criticalStatuses = [fraudStatus, limitStatus, beneficiaryStatus, complianceStatus];
  const status = criticalStatuses.every((item) => item === "UP") ? "UP" : "DEGRADED";

  res.json({
    service: "transaction-service",
    status,
    dependencies: [
      { name: "fraud-check-service", status: fraudStatus },
      { name: "limit-service", status: limitStatus },
      { name: "beneficiary-service", status: beneficiaryStatus },
      { name: "compliance-service", status: complianceStatus },
      { name: "notification-service", status: notificationStatus }
    ]
  });
});

app.post("/transactions/demo", async (_req, res) => {
  const transactionId = nextTransactionId();
  const payload = {
    transactionId,
    amount: 1250,
    fromAccount: "acc_1001",
    toAccount: "acc_2002"
  };

  async function settleStep(serviceName, task) {
    try {
      return {
        serviceName,
        ok: true,
        payload: await task()
      };
    } catch (error) {
      return {
        serviceName,
        ok: false,
        message: error.message
      };
    }
  }

  try {
    const [limitCheck, beneficiaryCheck, complianceCheck, fraudCheck] = await Promise.all([
      settleStep("limit-service", () =>
        fetchJson(`${LIMIT_SERVICE_URL}/limits/check`, {
          method: "POST",
          body: JSON.stringify({
            accountId: payload.fromAccount,
            amount: payload.amount
          }),
          timeoutMs: 2500
        })
      ),
      settleStep("beneficiary-service", () =>
        fetchJson(`${BENEFICIARY_SERVICE_URL}/beneficiaries/validate`, {
          method: "POST",
          body: JSON.stringify({
            accountId: payload.fromAccount,
            beneficiaryAccountId: payload.toAccount
          }),
          timeoutMs: 2500
        })
      ),
      settleStep("compliance-service", () =>
        fetchJson(`${COMPLIANCE_SERVICE_URL}/compliance/check`, {
          method: "POST",
          body: JSON.stringify({
            accountId: payload.fromAccount,
            amount: payload.amount
          }),
          timeoutMs: 2500
        })
      ),
      settleStep("fraud-check-service", () =>
        fetchJson(`${FRAUD_CHECK_SERVICE_URL}/fraud/check`, {
          method: "POST",
          body: JSON.stringify(payload),
          timeoutMs: 2500
        })
      )
    ]);

    const unavailableCriticalChecks = [
      limitCheck,
      beneficiaryCheck,
      complianceCheck,
      fraudCheck
    ].filter((result) => !result.ok);

    if (unavailableCriticalChecks.some((result) => result.serviceName === "beneficiary-service")) {
      return res.status(503).json({
        transactionId,
        status: "failed",
        message:
          "Beneficiary validation is unavailable. Transaction cannot proceed safely right now.",
        failedChecks: unavailableCriticalChecks.map((result) => result.serviceName)
      });
    }

    if (unavailableCriticalChecks.length >= 2) {
      return res.status(503).json({
        transactionId,
        status: "failed",
        message:
          "Several critical banking checks are unavailable at the same time. Transaction pipeline failed.",
        failedChecks: unavailableCriticalChecks.map((result) => result.serviceName)
      });
    }

    if (!limitCheck.ok || !complianceCheck.ok || !fraudCheck.ok) {
      return res.status(202).json({
        transactionId,
        status: "pending_manual_review",
        message:
          "A critical dependency is unavailable. Transaction moved to manual review queue.",
        fraudCheckStatus: fraudCheck.ok ? "passed" : "unavailable",
        limitCheckStatus: limitCheck.ok ? "passed" : "unavailable",
        complianceStatus: complianceCheck.ok ? "passed" : "unavailable",
        beneficiaryStatus: beneficiaryCheck.ok ? "verified" : "unavailable",
        degraded: true
      });
    }

    if (!limitCheck.payload.approved) {
      return res.status(202).json({
        transactionId,
        status: "pending_limit_review",
        message: "Transfer limit validation failed. Transaction moved to review queue.",
        fraudCheckStatus: "skipped",
        limitCheckStatus: "failed",
        complianceStatus: "skipped",
        beneficiaryStatus: beneficiaryCheck.payload.beneficiaryStatus,
        degraded: true
      });
    }

    if (!beneficiaryCheck.payload.approved) {
      return res.status(422).json({
        transactionId,
        status: "failed",
        message: "Beneficiary validation rejected the target account.",
        beneficiaryStatus: beneficiaryCheck.payload.beneficiaryStatus
      });
    }

    if (!complianceCheck.payload.approved) {
      return res.status(202).json({
        transactionId,
        status: "pending_compliance_review",
        message: "Compliance review is required before approval.",
        fraudCheckStatus: "skipped",
        limitCheckStatus: "passed",
        complianceStatus: "review_required",
        beneficiaryStatus: beneficiaryCheck.payload.beneficiaryStatus,
        degraded: true
      });
    }

    if (!fraudCheck.payload.approved) {
      return res.status(202).json({
        transactionId,
        status: "rejected",
        message: "Transaction rejected by fraud check.",
        fraudCheckStatus: "failed",
        limitCheckStatus: "passed",
        complianceStatus: "passed",
        beneficiaryStatus: beneficiaryCheck.payload.beneficiaryStatus
      });
    }

    let notificationStatus = "queued";
    try {
      await fetchJson(`${NOTIFICATION_SERVICE_URL}/notify`, {
        method: "POST",
        body: JSON.stringify({
          transactionId,
          channel: "sms",
          status: "approved"
        }),
        timeoutMs: 2000
      });
    } catch (_error) {
      notificationStatus = "unavailable";
    }

    return res.json({
      transactionId,
      status: "approved",
      message: "Transaction approved after limit and fraud checks.",
      fraudCheckStatus: fraudCheck.payload.risk || "passed",
      limitCheckStatus: "passed",
      complianceStatus: "passed",
      beneficiaryStatus: beneficiaryCheck.payload.beneficiaryStatus,
      notificationStatus
    });
  } catch (error) {
    console.warn(
      `[transaction-service] dependency unavailable, switching to safe fallback: ${error.message}`
    );

    return res.status(202).json({
      transactionId,
      status: "pending_manual_review",
      message:
        "A critical dependency is unavailable. Transaction moved to manual review queue.",
      fraudCheckStatus: "unavailable",
      limitCheckStatus: "unknown",
      complianceStatus: "unknown",
      beneficiaryStatus: "unknown",
      degraded: true
    });
  }
});

app.listen(PORT, () => {
  console.log(`[transaction-service] listening on port ${PORT}`);
});
