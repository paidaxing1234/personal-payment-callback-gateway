import net from "node:net";
import { AppError } from "./errors.js";

const PRIVATE_HOSTS = new Set(["localhost", "localhost.localdomain"]);

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
}

export function validateWebhookUrl(rawUrl, allowPrivateWebhooks = false) {
  if (!rawUrl) return "";

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(400, "invalid_webhook_url", "Webhook URL must be a valid http or https URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(400, "invalid_webhook_url", "Webhook URL must use http or https.");
  }

  if (parsed.username || parsed.password) {
    throw new AppError(400, "invalid_webhook_url", "Webhook URL must not contain credentials.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const ipVersion = net.isIP(hostname);
  const privateHost = PRIVATE_HOSTS.has(hostname) || isPrivateIpv4(hostname) || (ipVersion === 6 && isPrivateIpv6(hostname));

  if (privateHost && !allowPrivateWebhooks) {
    throw new AppError(400, "private_webhook_url_blocked", "Private webhook URLs are blocked unless ALLOW_PRIVATE_WEBHOOKS=true.");
  }

  return parsed.toString();
}

export function requireBearer(req, expectedToken, name) {
  if (!expectedToken) {
    throw new AppError(403, "missing_server_token", `${name} is not configured on the server.`);
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (token !== expectedToken) {
    throw new AppError(401, "unauthorized", "Invalid or missing bearer token.");
  }
}

export function requireAdmin(req, config) {
  if (!config.adminToken) {
    throw new AppError(403, "admin_token_required", "ADMIN_TOKEN must be configured for admin operations.");
  }

  requireBearer(req, config.adminToken, "ADMIN_TOKEN");
}
