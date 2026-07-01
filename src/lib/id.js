import crypto from "node:crypto";

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

export function newOrderNo(date = new Date()) {
  const stamp = date.toISOString().replace(/\D/g, "").slice(0, 14);
  return `MPCG${stamp}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}
