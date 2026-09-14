/* eslint-disable no-undef */
// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Present Bar (portrait strip at bottom of chat)
// ────────────────────────────────────────────────────────────────────────

import { extension_settings, getContext } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { el, isMaleSex, avatarNode } from "./dom.js";

const EXT_NAME = "NPC-Bank";
const BAR_ID = "npc-bank-present-bar";
const SETTINGS_KEY = "presentBar";

const DEFAULTS = Object.freeze({
    enabled: true,
    position: "bottom",
    height: 72,
    scale: 1.0,
    maxVisible: 8,
    clickAction: "openBook", // "openBook" | "focus" | "none"
});

let initialised = false;
let castGetter = null;
let onOpenInBook = null;

// ────────────────────────────────────────────────────────────────────────────
// Settings
// ────────────────────────────────────────────────────────────────────────

function settings() {
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = {};
    if (!extension_settings[EXT_NAME][SETTINGS_KEY]) {
        extension_settings[EXT_NAME][SETTINGS_KEY] = structuredClone(DEFAULTS);
    }
    const cur = extension_settings[EXT_NAME][SETTINGS_KEY];
    for (const k of Object.keys(DEFAULTS)) {
        if (cur[k] === undefined) cur[k] = DEFAULTS[k];
    }
    return cur;
}

function persist() {
    try { saveSettingsDebounced(); } catch (e) { /* noop */ }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

/** Initialize the present bar */
export function initPresentBar({ castGetter: getter, onOpenInBook: handler } = {}) {
    if (initialised) return;
    initialised = true;

    castGetter = getter || (() => []);
    onOpenInBook = handler || (() => {});

    injectStylesheet();
    buildBar();

    const cfg = settings();
    if (cfg.enabled) {
        refreshPresentBar();
    }

    // Watch for chat changes
    if (typeof eventSource !== "undefined" && typeof event_types !== "undefined") {
        eventSource.on(event_types.CHAT_CHANGED, () => {
            setTimeout(() => refreshPresentBar(), 100);
        });
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
            setTimeout(() => refreshPresentBar(), 100);
        });
    }
}

/** Refresh the present bar content */
export function refreshPresentBar() {
    const cfg = settings();
    if (!cfg.enabled) {
        hideBar();
        return;
    }

    const cast = castGetter ? castGetter() : [];
    if (!cast?.length) {
        hideBar();
        return;
    }

    showBar(cast.slice(0, cfg.maxVisible));
}

/** Get present bar settings */
export function getPresentBarSettings() {
    return settings();
}

/** Apply present bar setting change */
export function applyPresentBarChange(key, value) {
    const cfg = settings();
    cfg[key] = value;
    persist();
    refreshPresentBar();
}

// ────────────────────────────────────────────────────────────────────────────
// Bar DOM
// ────────────────────────────────────────────────────────────────────────

function buildBar() {
    if (document.getElementById(BAR_ID)) return;

    const bar = el("div", { id: BAR_ID, class: "npc-bank-present-bar" },
        el("div", { class: "npc-bank-present-track", id: "npc-bank-present-track" })
    );
    document.body.appendChild(bar);
}

function showBar(cast) {
    const bar = document.getElementById(BAR_ID);
    const track = document.getElementById("npc-bank-present-track");
    if (!bar || !track) return;

    const cfg = settings();

    track.innerHTML = "";
    
    cast.forEach((member, idx) => {
        const male = isMaleSex(member.sex);
        const accent = male ? "var(--npc-bank-male, #3b82f6)" : "var(--npc-bank-female, #f43f5e)";
        
        const item = el("div", {
            class: "npc-bank-present-item",
            style: { "--accent": accent },
            title: member.name,
            onclick: () => handleItemClick(member, idx),
        },
            el("div", { class: "npc-bank-present-avatar" },
                avatarNode(member, member.name, { portrait: true, size: 56 })
            ),
            el("div", { class: "npc-bank-present-name" }, member.name)
        );
        track.appendChild(item);
    });

    bar.style.display = "flex";
    bar.style.height = cfg.height + "px";
    track.style.transform = `scale(${cfg.scale})`;
    
    // Position
    if (cfg.position === "top") {
        bar.style.top = "0";
        bar.style.bottom = "auto";
    } else {
        bar.style.bottom = "0";
        bar.style.top = "auto";
    }
}

function hideBar() {
    const bar = document.getElementById(BAR_ID);
    if (bar) bar.style.display = "none";
}

function handleItemClick(member, idx) {
    const cfg = settings();
    switch (cfg.clickAction) {
        case "openBook":
            if (onOpenInBook) onOpenInBook(member.name);
            break;
        case "focus":
            // Focus on NPC in panel
            if (typeof window.openNpcBook === "function") {
                window.openNpcBook(idx);
            }
            break;
    }
}

function injectStylesheet() {
    if (document.getElementById("npc-bank-present-bar-styles")) return;
    const link = document.createElement("link");
    link.id = "npc-bank-present-bar-styles";
    link.rel = "stylesheet";
    link.href = `scripts/extensions/third-party/${EXT_NAME}/style.css`;
    document.head.appendChild(link);
}