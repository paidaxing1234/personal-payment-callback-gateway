import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "./errors.js";

const PRIVATE_HOSTS = new Set(["localhost", "localhost.localdomain"]);

function normalizeHostname(hostname) {
  return String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address) {
  const normalized = normalizeHostname(address);
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("ff")
  );
}

function isPrivateAddress(hostnameOrAddress) {
  const normalized = normalizeHostname(hostnameOrAddress);
  if (PRIVATE_HOSTS.has(normalized)) return true;
  const ipVersion = net.isIP(normalized);
  return (ipVersion === 4 && isPrivateIpv4(normalized)) || (ipVersion === 6 && isPrivateIpv6(normalized));
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

  const hostname = normalizeHostname(parsed.hostname);
  if (isPrivateAddress(hostname) && !allowPrivateWebhooks) {
    throw new AppError(400, "private_webhook_url_blocked", "Private webhook URLs are blocked unless ALLOW_PRIVATE_WEBHOOKS=true.");
  }

  return parsed.toString();
}

export async function assertWebhookUrlResolvesPublic(rawUrl, allowPrivateWebhooks = false) {
  if (!rawUrl || allowPrivateWebhooks) return;
  const parsed = new URL(rawUrl);
  const hostname = normalizeHostname(parsed.hostname);

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new AppError(400, "private_webhook_url_blocked", "Private webhook URLs are blocked unless ALLOW_PRIVATE_WEBHOOKS=true.");
    }
    return;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError(400, "webhook_dns_lookup_failed", "Webhook URL hostname could not be resolved.");
  }

  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new AppError(400, "private_webhook_url_blocked", "Webhook URL resolves to a private or reserved address.");
  }
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

export function requireMerchant(req, config) {
  if (!config.merchantToken) {
    throw new AppError(403, "merchant_token_required", "MERCHANT_TOKEN must be configured for merchant API operations.");
  }

  requireBearer(req, config.merchantToken, "MERCHANT_TOKEN");
}
