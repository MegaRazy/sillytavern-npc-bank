/* eslint-disable no-undef */
// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Side Panel DOM Helpers
// ────────────────────────────────────────────────────────────────────────

/** Create an element with attributes and children */
export function el(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === "style" && typeof value === "object") {
            Object.assign(element.style, value);
        } else if (key === "class") {
            element.className = value;
        } else if (key === "html") {
            element.innerHTML = value;
        } else if (key.startsWith("on") && typeof value === "function") {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === "dataset") {
            Object.entries(value).forEach(([k, v]) => element.dataset[k] = v);
        } else {
            element.setAttribute(key, value);
        }
    });
    children.flat().forEach(child => {
        if (child == null) return;
        if (typeof child === "string" || typeof child === "number") {
            element.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof Node) {
            element.appendChild(child);
        } else if (Array.isArray(child)) {
            child.forEach(c => element.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
        }
    });
    return element;
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

/** Check if sex indicates male */
export function isMaleSex(sex) {
    if (!sex) return true;
    const s = sex.toLowerCase();
    return s.includes("male") || s.includes("man") || s.includes("boy") || s === "m";
}

/** Create avatar node for NPC */
export function avatarNode(npc, fallbackName, options = {}) {
    const { portrait = true, size = 32 } = options;
    
    if (portrait && npc?.pfp) {
        return el("img", {
            class: "npc-bank-avatar-img",
            src: npc.pfp,
            alt: npc.name || fallbackName,
            style: { width: `${size}px`, height: `${size}px`, borderRadius: "50%", objectFit: "cover" }
        });
    }
    
    const male = isMaleSex(npc?.sex);
    const accent = male ? "var(--npc-bank-male, #3b82f6)" : "var(--npc-bank-female, #f43f5e)";
    const initial = (npc?.name || fallbackName || "?")[0].toUpperCase();
    
    return el("div", {
        class: "npc-bank-avatar",
        style: { 
            width: `${size}px`, 
            height: `${size}px`, 
            borderRadius: "50%", 
            background: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: "bold",
            fontSize: `${size * 0.4}px`
        }
    }, initial);
}