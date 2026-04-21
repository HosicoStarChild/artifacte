const REJECTED_TRANSACTION_PATTERNS = [
  "user rejected",
  "rejected the request",
  "user declined",
  "declined",
  "cancelled",
  "canceled",
] as const;

const WALLET_REJECTION_ERROR_NAMES = [
  "walletsigntransactionerror",
  "walletsendtransactionerror",
  "walletsignmessageerror",
  "walleterror",
] as const;

export const TRANSACTION_REQUEST_REJECTED_MESSAGE = "transaction request rejected";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getErrorName(error: Record<string, unknown>): string | null {
  const directName = getString(error.name);
  if (directName) {
    return directName;
  }

  const prototype = Object.getPrototypeOf(error) as { constructor?: { name?: string } } | null;
  return getString(prototype?.constructor?.name);
}

function getErrorCode(error: Record<string, unknown>): string | number | null {
  const code = error.code;

  if (typeof code === "string" || typeof code === "number") {
    return code;
  }

  return null;
}

function getNestedErrors(error: Record<string, unknown>): unknown[] {
  return [error.error, error.cause].filter((value) => value !== undefined);
}

export function getTransactionErrorMessage(error: unknown, fallback = "Transaction failed"): string {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined || current === null || seen.has(current)) {
      continue;
    }

    seen.add(current);

    const directString = getString(current);
    if (directString) {
      return directString;
    }

    if (!isRecord(current)) {
      continue;
    }

    const message = getString(current.message);
    if (message) {
      return message;
    }

    queue.push(...getNestedErrors(current));
  }

  return fallback;
}

export function isTransactionRequestRejected(error: unknown): boolean {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined || current === null || seen.has(current)) {
      continue;
    }

    seen.add(current);

    const directString = getString(current)?.toLowerCase();
    if (directString && REJECTED_TRANSACTION_PATTERNS.some((pattern) => directString.includes(pattern))) {
      return true;
    }

    if (!isRecord(current)) {
      continue;
    }

    const message = getString(current.message)?.toLowerCase() ?? "";
    const name = getErrorName(current)?.toLowerCase() ?? "";
    const code = getErrorCode(current);
    const normalizedCode = typeof code === "number" ? code : Number.parseInt(code ?? "", 10);

    if (normalizedCode === 4001) {
      return true;
    }

    const combinedText = `${message} ${name}`.trim();
    if (REJECTED_TRANSACTION_PATTERNS.some((pattern) => combinedText.includes(pattern))) {
      return true;
    }

    if (!message && WALLET_REJECTION_ERROR_NAMES.some((pattern) => name.includes(pattern))) {
      return true;
    }

    queue.push(...getNestedErrors(current));
  }

  return false;
}