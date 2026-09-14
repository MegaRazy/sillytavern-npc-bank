// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Refresh Hooks
// ────────────────────────────────────────────────────────────────────────

export const REFRESH = {
    NPC_BANK: "npc_bank",
    NPC_BOOK: "npc_book",
    SETTINGS: "settings",
};

const hooks = new Map();

/** Register a refresh hook */
export function registerRefreshHook(name, fn) {
    if (!hooks.has(name)) hooks.set(name, []);
    hooks.get(name).push(fn);
}

/** Fire a refresh hook */
export function fireRefreshHook(name, ...args) {
    const fns = hooks.get(name);
    if (fns) fns.forEach(fn => fn(...args));
}