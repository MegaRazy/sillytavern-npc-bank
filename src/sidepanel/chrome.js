/* eslint-disable no-undef */
// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Side Panel Chrome (window management: drag/resize/dock-float/scale)
// ────────────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD = 4; // px before drag starts

let activePanel = null;
let dragState = null;

/** Initialize panel chrome (drag, resize, dock/float, scale) */
export function initPanelChrome(panel, { getSettings, persist, onLayoutChange }) {
    activePanel = panel;
    const cfg = getSettings();

    // Header drag for docked mode (move panel edge)
    const header = panel.querySelector(".npc-bank-header");
    if (header) {
        header.addEventListener("mousedown", (e) => {
            if (e.target.closest("button")) return;
            if (cfg.mode !== "docked") return;
            startDrag(e, "docked-move");
        });
    }

    // FAB drag for floating mode
    const fab = panel.querySelector(".npc-bank-fab");
    if (fab) {
        fab.addEventListener("mousedown", (e) => {
            if (cfg.mode !== "floating") return;
            startDrag(e, "floating-move");
        });
    }

    // Resize handle (right edge when docked)
    const resizeHandle = el("div", { class: "npc-bank-resize-handle" });
    panel.appendChild(resizeHandle);
    resizeHandle.addEventListener("mousedown", (e) => {
        if (cfg.mode !== "docked") return;
        startDrag(e, "resize");
    });

    // Global mouse events
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && cfg.enabled && !cfg.collapsed) {
            togglePanel();
        }
    });

    function startDrag(e, type) {
        dragState = {
            type,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: panel.offsetWidth,
            startLeft: panel.offsetLeft,
            startTop: panel.offsetTop,
            startFloatX: cfg.float?.x,
            startFloatY: cfg.float?.y,
            moved: false,
        };
        document.body.style.userSelect = "none";
        document.body.style.cursor = type === "resize" ? "ew-resize" : "move";
    }

    function onMouseMove(e) {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        if (!dragState.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragState.moved = true;

        const cfg = getSettings();

        switch (dragState.type) {
            case "resize": {
                const newWidth = Math.max(240, Math.min(600, dragState.startWidth - dx));
                panel.style.width = newWidth + "px";
                cfg.width = newWidth;
                persist();
                break;
            }
            case "docked-move": {
                // Switch to floating if dragged far enough
                if (Math.abs(dx) > 50 || Math.abs(dy) > 50) {
                    setMode("floating");
                    // Recalculate as floating drag
                    dragState.type = "floating-move";
                    dragState.startFloatX = e.clientX - panel.offsetWidth / 2;
                    dragState.startFloatY = e.clientY - panel.offsetHeight / 2;
                }
                break;
            }
            case "floating-move": {
                const newX = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, dragState.startFloatX + dx));
                const newY = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, dragState.startFloatY + dy));
                panel.style.left = newX + "px";
                panel.style.top = newY + "px";
                panel.style.right = "auto";
                panel.style.bottom = "auto";
                cfg.float.x = newX;
                cfg.float.y = newY;
                persist();
                break;
            }
        }
    }

    function onMouseUp() {
        if (dragState) {
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            if (dragState.moved && onLayoutChange) onLayoutChange();
            dragState = null;
        }
    }
}

/** Apply layout (docked/floating) */
export function applyLayout(panel, mode) {
    const cfg = panel.__settings?.() || { mode: "docked", position: "right", width: 340 };
    
    panel.classList.remove("npc-bank-docked-left", "npc-bank-docked-right", "npc-bank-floating");
    
    if (mode === "floating") {
        panel.classList.add("npc-bank-floating");
        panel.style.left = cfg.float?.x ?? "auto";
        panel.style.top = cfg.float?.y ?? "auto";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.width = cfg.float?.w ?? "620px";
        panel.style.height = cfg.float?.h ?? "720px";
        panel.style.maxHeight = "none";
    } else {
        panel.classList.add(`npc-bank-docked-${cfg.position}`);
        panel.style.left = "";
        panel.style.top = "";
        panel.style.right = "";
        panel.style.bottom = "";
        panel.style.width = cfg.width + "px";
        panel.style.height = "100%";
        panel.style.maxHeight = "100%";
    }
}

/** Apply scale */
export function applyScale(panel, scale) {
    panel.style.transform = `scale(${scale})`;
    panel.style.transformOrigin = "top right";
}

/** Set mode (docked/floating) */
export function setMode(mode) {
    const panel = document.getElementById("npc-bank-panel");
    if (!panel) return;
    const cfg = panel.__settings?.() || { mode: "docked" };
    cfg.mode = mode;
    if (panel.__persist) panel.__persist();
    applyLayout(panel, mode);
}

/** Clamp panel to viewport */
export function clampToViewport(panel) {
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    let changed = false;
    if (rect.right > vw) {
        panel.style.left = (vw - rect.width) + "px";
        changed = true;
    }
    if (rect.left < 0) {
        panel.style.left = "0px";
        changed = true;
    }
    if (rect.bottom > vh) {
        panel.style.top = (vh - rect.height) + "px";
        changed = true;
    }
    if (rect.top < 0) {
        panel.style.top = "0px";
        changed = true;
    }
    return changed;
}