// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Side Panel (Megumin-style orchestrator)
// ────────────────────────────────────────────────────────────────────────

import { extension_settings, getContext } from "../../../../extensions.js";
import {
    eventSource,
    event_types,
    saveSettingsDebounced,
} from "../../../../script.js";
import { findLastAssistantMessage, getParsedBlockCounts, getParsedBlockTypes, parseMessage } from "./parsers.js";
import { el, escapeHtml, isMaleSex, avatarNode } from "./dom.js";
import { SECTION_REGISTRY } from "./sections.js";
import {
    initPanelChrome,
    applyLayout,
    applyScale,
    setMode,
    clampToViewport,
} from "./chrome.js";
import {
    initPresentBar,
    refreshPresentBar,
    getPresentBarSettings,
    applyPresentBarChange,
} from "./presentBar.js";

const EXT_NAME = "NPC-Bank";
const PANEL_ID = "npc-bank-panel";
const FAB_ID = "npc-bank-fab";
const BODY_HIDE_CLASS = "npc-bank-hide-inline";
const BODY_OPEN_CLASS = "npc-bank-panel-open";
const SETTINGS_KEY = "sidePanel";

const BUILD_TAG = "2026-09-01a";
try { console.debug(`[NPC Bank Side Panel] sidepanel build ${BUILD_TAG}`); } catch (e) { /* */ }

const DEFAULTS = Object.freeze({
    schemaVersion: 2,
    enabled: false,
    mode: "docked",              // "docked" | "floating"
    position: "right",           // docked edge
    width: 340,                  // docked width px
    collapsed: false,
    hideInline: true,
    scale: 1.0,                  // 0.8–1.4
    autoHideEmpty: true,
    float: { x: null, y: null, w: 620, h: 720 },
    sections: {
        newNpcs:      { visible: true, open: true,  order: 0 },
        npcBank:      { visible: true, open: true,  order: 1 },
    },
});

let initialised = false;
let getProfile = () => ({});
let pendingRender = null;
const lastBadgeCounts = new Map();

// ────────────────────────────────────────────────────────────────────────────
// Settings + migration
// ────────────────────────────────────────────────────────────────────────

function migrateSidePanelSettings(cur) {
    for (const def of SECTION_REGISTRY) {
        const v = cur.sections[def.id];
        if (typeof v === "boolean") {
            cur.sections[def.id] = { visible: v, open: def.defaultOpen, order: def.order };
        } else if (v === undefined) {
            cur.sections[def.id] = { visible: true, open: def.defaultOpen, order: def.order };
        }
    }
    cur.schemaVersion = 2;
}

function settings() {
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = {};
    if (!extension_settings[EXT_NAME][SETTINGS_KEY]) {
        extension_settings[EXT_NAME][SETTINGS_KEY] = structuredClone(DEFAULTS);
    } else {
        const cur = extension_settings[EXT_NAME][SETTINGS_KEY];
        const def = DEFAULTS;
        for (const k of Object.keys(def)) {
            if (cur[k] === undefined) cur[k] = structuredClone(def[k]);
        }
        if (!cur.sections) cur.sections = structuredClone(def.sections);
        for (const sd of SECTION_REGISTRY) {
            if (cur.sections[sd.id] === undefined) {
                cur.sections[sd.id] = { visible: true, open: sd.defaultOpen, order: sd.order };
            }
        }
        if (!cur.float || typeof cur.float !== "object") cur.float = structuredClone(def.float);
    }
    return extension_settings[EXT_NAME][SETTINGS_KEY];
}

function persist() {
    try { saveSettingsDebounced(); } catch (e) { /* noop */ }
}

// ────────────────────────────────────────────────────────────────────────────
// Panel skeleton
// ────────────────────────────────────────────────────────────────────────

function buildPanelSkeleton() {
    const cfg = settings();

    const fab = el("button", {
        id: FAB_ID,
        class: "npc-bank-fab",
        title: "NPC Bank",
    }, el("i", { class: "fa-solid fa-address-book" }));
    fab.addEventListener("click", () => togglePanel());

    const panel = el("aside", {
        id: PANEL_ID,
        class: `npc-bank-panel${cfg.collapsed ? " npc-bank-collapsed" : ""}`,
    });

    const header = el("div", { class: "npc-bank-header" },
        el("div", { class: "npc-bank-header-bg", id: "npc-bank-header-bg" }),
        el("div", { class: "npc-bank-header-overlay" }),
        el("div", { class: "npc-bank-title" },
            el("i", { class: "fa-solid fa-users" }),
            " NPC Bank"),
        el("div", { class: "npc-bank-header-actions" },
            el("button", {
                class: "npc-bank-icon-btn",
                title: "Open NPC Book",
                onclick: () => openNpcBook(),
            }, el("i", { class: "fa-solid fa-book-open" })),
            el("button", {
                class: "npc-bank-icon-btn",
                title: "Refresh",
                onclick: () => { render(); refreshPresentBar(); },
            }, el("i", { class: "fa-solid fa-rotate" })),
            el("button", {
                class: "npc-bank-icon-btn",
                title: "Collapse panel",
                onclick: () => togglePanel(false),
            }, el("i", { class: "fa-solid fa-xmark" })),
        ),
    );

    const body = el("div", { class: "npc-bank-body" });
    body.appendChild(el("div", { class: "npc-bank-empty", id: "npc-bank-empty" },
        el("i", { class: "fa-solid fa-users" }),
        el("p", {}, "No NPC data yet. The panel updates whenever the AI emits NPC dossiers."),
    ));
    body.appendChild(el("div", { class: "npc-bank-sections", id: "npc-bank-sections" }));

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(fab);
    document.body.appendChild(panel);

    initPanelChrome(panel, {
        getSettings: settings,
        persist,
        onLayoutChange: () => syncBodyClasses(),
    });
}

// ────────────────────────────────────────────────────────────────────────────
// NPC Book bridge — opens the existing NPC Bank modal
// ────────────────────────────────────────────────────────────────────────

function clickNpcBankDot() {
    const tab = document.getElementById("npc_bank_tab");
    if (tab) tab.click();
}

function openNpcBook(npcIdx) {
    if (typeof window.openNpcBook === "function") {
        window.openNpcBook(npcIdx);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Inline block hiding
// ────────────────────────────────────────────────────────────────────────

function applyInlineHidingPass() {
    const cfg = settings();
    if (!cfg.hideInline) return;

    const msg = findLastAssistantMessage();
    if (!msg) return;

    const blocksToHide = new Set();
    SECTION_REGISTRY.forEach(sec => {
        if (sec.inlineBlockNames) {
            sec.inlineBlockNames.forEach(name => blocksToHide.add(name));
        }
    });

    msg.querySelectorAll(".mes_block").forEach(block => {
        const header = block.querySelector(".mes_block_header");
        if (!header) return;
        const name = header.textContent.trim().replace(/\s+/g, " ").split(" ")[0];
        if (blocksToHide.has(name)) {
            block.classList.add(BODY_HIDE_CLASS);
        }
    });
}

function watchInlineRewrites() {
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type === "childList" && m.addedNodes.length) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1 && node.classList?.contains?.("mes_block")) {
                        const header = node.querySelector(".mes_block_header");
                        if (header) {
                            const name = header.textContent.trim().split(" ")[0];
                            const blocksToHide = new Set();
                            SECTION_REGISTRY.forEach(sec => {
                                if (sec.inlineBlockNames) {
                                    sec.inlineBlockNames.forEach(n => blocksToHide.add(n));
                                }
                            });
                            if (blocksToHide.has(name)) {
                                node.classList.add(BODY_HIDE_CLASS);
                            }
                        }
                    }
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function resumeInlineHiding(reason) {
    const hidden = document.querySelectorAll(`.${BODY_HIDE_CLASS}`);
    if (!hidden.length) return false;
    hidden.forEach(el => el.classList.remove(BODY_HIDE_CLASS));
    applyInlineHidingPass();
    return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Panel rendering
// ────────────────────────────────────────────────────────────────────────

function scheduleRender(delay = 0) {
    if (pendingRender) return;
    pendingRender = setTimeout(() => {
        pendingRender = null;
        render();
    }, delay);
}

function render() {
    const cfg = settings();
    if (!cfg.enabled) return;

    const context = getContext();
    const hasChat = !!(context?.chat?.messages?.length);

    // Parse latest assistant message for inline blocks
    const lastMsg = findLastAssistantMessage();
    const parsed = lastMsg ? parseMessage(lastMsg) : { newNpcs: [], npcUpdates: [] };

    const ctx = {
        parsed,
        profile: getProfile(),
        cfg,
        hasChat,
        openNpcBook,
        lookupBankedNpc: (name) => {
            const bank = getProfile().npcBank;
            if (!bank?.npcs) return null;
            return bank.npcs.find(n => n.name?.toLowerCase() === name.toLowerCase()) || null;
        },
    };

    // Render sections
    const sectionsContainer = document.getElementById("npc-bank-sections");
    if (!sectionsContainer) return;

    const emptyState = document.getElementById("npc-bank-empty");
    let anyVisible = false;

    // Sort sections by order
    const sortedSections = [...SECTION_REGISTRY].sort((a, b) => {
        const oa = cfg.sections[a.id]?.order ?? a.order;
        const ob = cfg.sections[b.id]?.order ?? b.order;
        return oa - ob;
    });

    // Clear and rebuild
    sectionsContainer.innerHTML = "";
    sortedSections.forEach(sec => {
        const secCfg = cfg.sections[sec.id];
        if (!secCfg?.visible) return;

        const node = sec.render(ctx);
        if (!node) {
            if (cfg.autoHideEmpty) return;
        } else {
            anyVisible = true;
        }

        const wrapper = el("div", { class: "npc-bank-section", "data-section": sec.id });
        const header = el("div", { class: "npc-bank-section-header" },
            el("div", { class: "npc-bank-section-title" },
                el("i", { class: sec.icon }),
                " ", sec.title,
            ),
            el("button", {
                class: "npc-bank-section-toggle",
                "aria-expanded": secCfg.open,
                onclick: () => toggleSection(sec.id),
            }, el("i", { class: `fa-solid fa-chevron-${secCfg.open ? "down" : "right"}` })),
        );
        wrapper.appendChild(header);

        const content = el("div", { class: "npc-bank-section-content", style: { display: secCfg.open ? "block" : "none" } });
        if (node) content.appendChild(node);
        wrapper.appendChild(content);

        sectionsContainer.appendChild(wrapper);
    });

    if (emptyState) {
        emptyState.style.display = anyVisible || !hasChat ? "none" : "flex";
    }

    syncBodyClasses();
    updateBadges(parsed);
}

function toggleSection(sectionId) {
    const cfg = settings();
    const sec = cfg.sections[sectionId];
    if (!sec) return;
    sec.open = !sec.open;
    persist();
    const wrapper = document.querySelector(`.npc-bank-section[data-section="${sectionId}"]`);
    if (wrapper) {
        const content = wrapper.querySelector(".npc-bank-section-content");
        const toggle = wrapper.querySelector(".npc-bank-section-toggle");
        if (content) content.style.display = sec.open ? "block" : "none";
        if (toggle) {
            toggle.setAttribute("aria-expanded", sec.open);
            toggle.querySelector("i").className = `fa-solid fa-chevron-${sec.open ? "down" : "right"}`;
        }
    }
}

function syncBodyClasses() {
    const cfg = settings();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    document.body.classList.toggle(BODY_OPEN_CLASS, cfg.enabled && !cfg.collapsed);
}

function togglePanel(open) {
    const cfg = settings();
    if (open === undefined) open = !cfg.enabled;
    cfg.enabled = open;
    cfg.collapsed = !open;
    persist();
    syncBodyClasses();
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.toggle("npc-bank-collapsed", !open);
    if (open) {
        scheduleRender(0);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Badge updates
// ────────────────────────────────────────────────────────────────────────

function updateBadges(parsed) {
    const fab = document.getElementById(FAB_ID);
    if (!fab) return;

    let totalBadges = 0;
    SECTION_REGISTRY.forEach(sec => {
        if (sec.badge) {
            const count = sec.badge({ parsed }) || 0;
            if (count > 0) {
                totalBadges += count;
                let badge = fab.querySelector(`.npc-bank-badge[data-section="${sec.id}"]`);
                if (!badge) {
                    badge = el("span", { class: "npc-bank-badge", "data-section": sec.id }, String(count));
                    fab.appendChild(badge);
                } else {
                    badge.textContent = String(count);
                }
            } else {
                const badge = fab.querySelector(`.npc-bank-badge[data-section="${sec.id}"]`);
                if (badge) badge.remove();
            }
        }
    });

    if (totalBadges > 0) {
        fab.classList.add("has-badges");
    } else {
        fab.classList.remove("has-badges");
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

/** Initialize the side panel */
export function initSidePanel({ profileGetter } = {}) {
    if (initialised) return;
    initialised = true;

    if (typeof profileGetter === "function") getProfile = profileGetter;

    injectStylesheet();
    initPresentBar({
        castGetter: buildPresentCast,
        onOpenInBook: (npcName) => {
            const list = getProfile()?.npcBank?.npcs || [];
            const idx = list.findIndex(n => (n.name || "").trim().toLowerCase() === (npcName || "").trim().toLowerCase());
            openNpcBook(idx >= 0 ? idx : undefined);
        },
    });

    const mount = () => {
        if (document.getElementById(PANEL_ID)) return;
        settings().collapsed = true;
        persist();
        buildPanelSkeleton();
        updateHeaderImage();
        render();
        applyInlineHidingPass();
        watchInlineRewrites();
        refreshPresentBar();
        installDebugHandle();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
        mount();
    }

    if (typeof eventSource !== "undefined" && typeof event_types !== "undefined") {
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
            scheduleRender(50);
            if (!resumeInlineHiding("reply rendered")) {
                setTimeout(applyInlineHidingPass, 0);
            }
        });
        eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
            setTimeout(applyInlineHidingPass, 0);
        });
        eventSource.on(event_types.MESSAGE_EDITED, () => {
            scheduleRender(50);
            setTimeout(applyInlineHidingPass, 0);
        });
        eventSource.on(event_types.MESSAGE_UPDATED, () => {
            setTimeout(applyInlineHidingPass, 0);
        });
        eventSource.on(event_types.MESSAGE_DELETED, () => {
            scheduleRender(50);
            setTimeout(applyInlineHidingPass, 0);
        });
        eventSource.on(event_types.MESSAGE_SWIPED, () => {
            scheduleRender(50);
            setTimeout(applyInlineHidingPass, 50);
        });
        eventSource.on(event_types.CHAT_CHANGED, () => {
            scheduleRender(100);
            setTimeout(applyInlineHidingPass, 0);
        });
        eventSource.on(event_types.MORE_MESSAGES_LOADED, () => {
            setTimeout(applyInlineHidingPass, 0);
        });
    }
}

/** Force a panel re-render */
export function refreshPanel() {
    render();
    refreshPresentBar();
}

// ────────────────────────────────────────────────────────────────────────────
// Present Bar (portrait strip at bottom)
// ────────────────────────────────────────────────────────────────────────

function buildPresentCast() {
    const profile = getProfile();
    const bank = profile?.npcBank;
    if (!bank?.npcs?.length) return [];

    const settings = getSettings();
    const limit = settings.injectionLimit || 3;

    return bank.npcs
        .slice(0, limit)
        .map(n => ({
            name: n.name || "Unnamed",
            portrait: n.pfp || null,
            sex: n.sex || "female",
            onClick: () => openNpcBook(),
        }));
}

function updateHeaderImage() {
    const bg = document.getElementById("npc-bank-header-bg");
    if (!bg) return;
    const profile = getProfile();
    const bank = profile?.npcBank;
    if (!bank?.npcs?.length) return;
    const first = bank.npcs[0];
    if (first.pfp) {
        bg.style.backgroundImage = `url("${first.pfp}")`;
        bg.style.backgroundSize = "cover";
        bg.style.backgroundPosition = "center";
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Debug
// ────────────────────────────────────────────────────────────────────────

function installDebugHandle() {
    if (!window.NPCBankDebug) {
        window.NPCBankDebug = {
            render,
            togglePanel,
            openNpcBook,
            settings: () => settings(),
            profile: () => getProfile(),
        };
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Stylesheet injection
// ────────────────────────────────────────────────────────────────────────

function injectStylesheet() {
    if (document.getElementById("npc-bank-panel-styles")) return;
    const link = document.createElement("link");
    link.id = "npc-bank-panel-styles";
    link.rel = "stylesheet";
    link.href = `scripts/extensions/third-party/${EXT_NAME}/style.css`;
    document.head.appendChild(link);
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function getSettings() {
    if (!extension_settings[EXT_NAME]) return { enabled: true };
    return extension_settings[EXT_NAME].npcBank || { enabled: true };
}