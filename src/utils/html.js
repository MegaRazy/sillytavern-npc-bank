// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Utility: HTML Helpers
// ────────────────────────────────────────────────────────────────────────

/** Escape HTML attribute value */
export function escapeHtmlAttr(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, """)
        .replace(/'/g, "&#039;");
}

/** Escape HTML text content */
export function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, """)
        .replace(/'/g, "&#039;");
}