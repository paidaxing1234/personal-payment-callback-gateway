import path from "node:path";

function readBoolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function loadConfig(env = process.env) {
  const cwd = process.cwd();
  const nodeEnv = env.NODE_ENV || "development";

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: Number.parseInt(env.PORT || "8787", 10),
    dataFile: path.resolve(cwd, env.DATA_FILE || "./data/store.json"),
    adminToken: env.ADMIN_TOKEN || "",
    webhookSecret: env.WEBHOOK_SECRET || "development-webhook-secret",
    defaultWebhookUrl: env.DEFAULT_WEBHOOK_URL || "",
    allowPrivateWebhooks: readBoolean(env.ALLOW_PRIVATE_WEBHOOKS, false),
    simulateProviderToken: env.SIMULATE_PROVIDER_TOKEN || ""
  };
}
