import { AppError } from "./errors.js";

export function parseAmountToCents(amount) {
  const raw = String(amount ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new AppError(400, "invalid_amount", "Amount must be a positive number with up to 2 decimals.");
  }

  const [yuan, cents = ""] = raw.split(".");
  const value = Number.parseInt(yuan, 10) * 100 + Number.parseInt(cents.padEnd(2, "0"), 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AppError(400, "invalid_amount", "Amount must be greater than zero.");
  }
  return value;
}

export function centsToAmount(cents) {
  const value = Number(cents);
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
