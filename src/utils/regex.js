// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Utility: Regex Helpers
// ────────────────────────────────────────────────────────────────────────

/** Escape string for use in RegExp */
export function escapeRegex(str) {
    if (!str) return "";
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape for use in replacement string ($&, $`, $', $n) */
export function escapeReplacement(str) {
    if (!str) return "";
    return String(str).replace(/\$/g, "$$$$");
}