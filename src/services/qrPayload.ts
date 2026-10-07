/**
 * Customer QR payload parsing — pure, framework-free, unit tested.
 *
 * The Customer App prints the loyalty QR as an APP URL carrying an opaque token:
 *
 *     https://<customer-app>/<businessSlug>?ct=<64-hex token>
 *     (see Cafe-review `generateCustomerQR`: `clientUrl(slug, { ct: customerToken })`)
 *
 * The Staff App must therefore extract `ct` from a URL — NOT treat the whole URL
 * as a document id. Only the opaque token is trusted; the slug is a diagnostic
 * hint and every authorization decision still happens against the authenticated
 * staff member's clientId in Firestore.
 *
 * Supported legacy shapes (kept for older printed passes):
 *   - raw 64-hex token ("ct" value on its own)
 *   - JSON payload: {"token"|"ct"|"code"|"customerToken"|"qrToken": "..."}
 *   - URL without scheme: "app.example.com/bake?ct=..."
 *   - opaque short ids (customerId) — resolved only if they belong to the
 *     staff member's own business, cross-business checks still apply.
 */

/** Canonical customer token format enforced by the platform Security Rules. */
export const CUSTOMER_TOKEN_RE = /^[a-f0-9]{64}$/;
/** Opaque legacy ids (short tokens / customer document ids). */
export const OPAQUE_ID_RE = /^[A-Za-z0-9_-]{6,128}$/;

export type QrParseReason = "empty" | "unrecognized" | "invalid-format";

export interface CustomerQrPayload {
  /** Opaque value to resolve through customerTokens/{token}. */
  token: string;
  /** True when the token matches the canonical 64-hex platform format. */
  canonicalToken: boolean;
  /** Where the token was found (diagnostics). */
  source: "raw" | "url" | "json";
  /** First path segment of a URL payload, when present (never used for auth). */
  clientSlugHint?: string;
  /** The original scanned/entered string (truncated for diagnostics). */
  rawPreview: string;
  /**
   * True when the payload was not a canonical customer token, so the caller may
   * fall back to customers/{id} *after* the token lookup and after verifying the
   * resolved customer belongs to the staff member's business.
   */
  allowCustomerIdFallback: boolean;
}

export type QrParseResult =
  | { ok: true; payload: CustomerQrPayload }
  | { ok: false; reason: QrParseReason };

const TOKEN_KEYS = ["token", "ct", "code", "customerToken", "qrToken", "customerId"] as const;
const URL_TOKEN_PARAMS = ["ct", "token", "code", "customertoken"] as const;

function preview(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function unwrap(raw: string): string {
  let value = raw.trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
  ];
  for (const [open, close] of pairs) {
    if (value.length >= 2 && value.startsWith(open) && value.endsWith(close)) {
      value = value.slice(1, -1).trim();
    }
  }
  return value;
}

function classifyToken(value: string): { token: string; canonical: boolean; fallback: boolean } | null {
  const token = value.trim();
  if (!token) return null;
  if (CUSTOMER_TOKEN_RE.test(token)) {
    return { token, canonical: true, fallback: false };
  }
  if (OPAQUE_ID_RE.test(token)) {
    return { token, canonical: false, fallback: true };
  }
  return null;
}

function tokenFromQueryString(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of URL_TOKEN_PARAMS) {
    const value = params.get(key);
    if (value && value.trim()) return unwrap(value);
  }
  return null;
}

function parseJsonPayload(value: string): { token?: string; slug?: string } | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    for (const key of TOKEN_KEYS) {
      const candidate = parsed[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return {
          token: unwrap(candidate),
          slug:
            typeof parsed.slug === "string"
              ? parsed.slug
              : typeof parsed.clientSlug === "string"
                ? parsed.clientSlug
                : undefined,
        };
      }
    }
    return null;
  } catch {
    // Tolerate slightly malformed JSON produced by third-party QR tools.
    const match = value.match(
      /"(?:token|ct|code|customerToken|qrToken|customerId)"\s*:\s*"([^"]+)"/i
    );
    return match?.[1] ? { token: unwrap(match[1]) } : null;
  }
}

function parseUrlPayload(value: string): { token: string | null; slug?: string } | null {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  const looksLikeUrl =
    hasScheme || (value.includes("/") && (value.includes("?") || value.includes("=")));
  if (!looksLikeUrl) return null;

  let url: URL | null = null;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    url = null;
  }

  if (url) {
    let token: string | null = null;
    for (const key of URL_TOKEN_PARAMS) {
      const candidate = url.searchParams.get(key);
      if (candidate && candidate.trim()) {
        token = unwrap(candidate);
        break;
      }
    }
    const hashParams = url.hash.includes("?") ? url.hash.slice(url.hash.indexOf("?")) : url.hash;
    if (!token && hashParams) token = tokenFromQueryString(hashParams);
    const rawSlug = url.pathname.split("/").filter(Boolean)[0];
    let slug: string | undefined;
    if (rawSlug) {
      try {
        slug = decodeURIComponent(rawSlug);
      } catch {
        // A malformed display-only slug hint must not break token validation.
        slug = rawSlug;
      }
    }
    return { token, slug };
  }

  // Fall back to a manual split so a malformed URL still yields its `ct` value.
  const [beforeQuery, ...queryParts] = value.split("?");
  const query = queryParts.join("?");
  const slug = beforeQuery.split("/").filter(Boolean).pop();
  return { token: query ? tokenFromQueryString(query) : null, slug };
}

/**
 * Parses any scanned/typed payload into an opaque customer token.
 * Never performs I/O and never trusts a clientId contained in the payload.
 */
export function parseCustomerQrPayload(raw: unknown): QrParseResult {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const value = unwrap(raw);
  if (!value) return { ok: false, reason: "empty" };

  const rawPreview = preview(value);

  // 1. JSON payloads -------------------------------------------------------
  if (value.startsWith("{")) {
    const parsed = parseJsonPayload(value);
    if (!parsed?.token) return { ok: false, reason: "unrecognized" };
    const classified = classifyToken(parsed.token);
    if (!classified) return { ok: false, reason: "invalid-format" };
    return {
      ok: true,
      payload: {
        token: classified.token,
        canonicalToken: classified.canonical,
        source: "json",
        clientSlugHint: parsed.slug,
        rawPreview,
        allowCustomerIdFallback: classified.fallback,
      },
    };
  }

  // 2. URL payloads (the canonical Customer App pass) ----------------------
  const urlPayload = parseUrlPayload(value);
  if (urlPayload) {
    if (!urlPayload.token) return { ok: false, reason: "unrecognized" };
    const classified = classifyToken(urlPayload.token);
    if (!classified) return { ok: false, reason: "invalid-format" };
    return {
      ok: true,
      payload: {
        token: classified.token,
        canonicalToken: classified.canonical,
        source: "url",
        clientSlugHint: urlPayload.slug,
        rawPreview,
        allowCustomerIdFallback: classified.fallback,
      },
    };
  }

  // 3. Raw token / opaque id ----------------------------------------------
  let candidate = value;
  if (candidate.includes("?")) {
    candidate = tokenFromQueryString(candidate.split("?")[1] ?? "") ?? candidate;
  }
  if (candidate.includes("/")) {
    const segments = candidate.split("/").filter(Boolean);
    candidate = segments[segments.length - 1] ?? candidate;
  }

  const classified = classifyToken(candidate);
  if (!classified) return { ok: false, reason: "invalid-format" };

  return {
    ok: true,
    payload: {
      token: classified.token,
      canonicalToken: classified.canonical,
      source: "raw",
      rawPreview,
      allowCustomerIdFallback: classified.fallback,
    },
  };
}

/** QR payloads that are clearly not a customer pass (menu / review / table QR). */
export function looksLikeNonCustomerQr(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return (
    value.includes("/staff/") ||
    value.includes("/admin/") ||
    value.includes("/menu") ||
    value.includes("wifi")
  );
}
