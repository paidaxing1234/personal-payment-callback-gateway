import { AppError, assertAppError } from "./errors.js";

export async function readJson(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new AppError(413, "payload_too_large", "Request body is too large.");
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

export function sendError(res, error) {
  const appError = assertAppError(error);
  sendJson(res, appError.status, {
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details
    }
  });
}

export function notFound(res) {
  sendError(res, new AppError(404, "not_found", "Route not found."));
}

export function getPathParams(pathname, pattern) {
  const parts = pathname.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (parts.length !== patternParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i];
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(parts[i]);
      continue;
    }
    if (expected !== parts[i]) return null;
  }
  return params;
}
