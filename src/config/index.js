import path from "node:path";

function readBoolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const PLACEHOLDER_VALUES = new Set([
  "change-this-long-random-admin-token",
  "change-this-long-random-merchant-token",
  "change-this-long-random-webhook-secret",
  "change-this-simulate-provider-token",
  "development-webhook-secret"
]);

function validateProductionSecret(env, key, required = true) {
  const value = env[key] || "";
  if (required && !value) throw new Error(`${key} must be configured in production.`);
  if (value && PLACEHOLDER_VALUES.has(value)) throw new Error(`${key} must not use an example placeholder value in production.`);
}

export function loadConfig(env = process.env) {
  const cwd = process.cwd();
  const nodeEnv = env.NODE_ENV || "development";
  if (nodeEnv === "production") {
    validateProductionSecret(env, "ADMIN_TOKEN");
    validateProductionSecret(env, "MERCHANT_TOKEN");
    validateProductionSecret(env, "WEBHOOK_SECRET");
    validateProductionSecret(env, "SIMULATE_PROVIDER_TOKEN", false);
  }

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: Number.parseInt(env.PORT || "8787", 10),
    dataFile: path.resolve(cwd, env.DATA_FILE || "./data/store.json"),
    adminToken: env.ADMIN_TOKEN || "",
    merchantToken: env.MERCHANT_TOKEN || "",
    webhookSecret: env.WEBHOOK_SECRET || "development-webhook-secret",
    defaultWebhookUrl: env.DEFAULT_WEBHOOK_URL || "",
    allowPrivateWebhooks: readBoolean(env.ALLOW_PRIVATE_WEBHOOKS, false),
    simulateProviderToken: env.SIMULATE_PROVIDER_TOKEN || ""
  };
}
