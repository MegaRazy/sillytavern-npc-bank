/* eslint-disable no-undef */
// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Side Panel Section Registry
// ────────────────────────────────────────────────────────────────────────

import { el, escapeHtml, isMaleSex, avatarNode } from "./dom.js";
import { npcFields, npcBodyFields, npcFieldByRole, npcVitalsFields } from "../../features/npc/fields.js";
import { getNpcBank, npcBuildTextFromData } from "../../features/npc/data.js";

const noChat = (ctx) => ctx.hasChat === false;

// ────────────────────────────────────────────────────────────────────────────
// New NPC Dossiers (from latest message)
// ────────────────────────────────────────────────────────────────────────

function renderNewNpcs(ctx) {
    if (noChat(ctx)) return null;
    const list = ctx.parsed?.newNpcs;
    if (!list?.length) return null;

    const wrap = el("div", { class: "npc-bank-new-list" });
    
    list.forEach(({ name, parsed }) => {
        const male = isMaleSex(parsed.sex);
        const accentVar = male ? "var(--npc-bank-male, #3b82f6)" : "var(--npc-bank-female, #f43f5e)";
        
        const card = el("div", { 
            class: "npc-bank-new-card", 
            style: { "--accent": accentVar } 
        },
            el("div", { class: "npc-bank-new-header" },
                el("div", { class: "npc-bank-new-avatar" },
                    avatarNode(parsed, name, { portrait: false, size: 40 })
                ),
                el("div", { class: "npc-bank-new-info" },
                    el("div", { class: "npc-bank-new-name" }, name || "Unnamed"),
                    el("div", { class: "npc-bank-new-meta" }, 
                        [parsed.age, parsed.sex].filter(Boolean).join(" · ")
                    )
                )
            ),
            el("div", { class: "npc-bank-new-fields" },
                ...npcBodyFields().map(f => {
                    if (f.system === "imageTags") return null;
                    const val = parsed[f.id];
                    if (!val) return null;
                    return el("div", { class: "npc-bank-new-field" },
                        el("span", { class: "npc-bank-new-field-key" }, f.label + ":"),
                        el("span", { class: "npc-bank-new-field-val" }, val)
                    );
                }).filter(Boolean)
            ),
            el("button", {
                class: "npc-bank-new-save",
                onclick: () => saveNewNpc(parsed, name),
            }, "Save to Bank")
        );
        wrap.appendChild(card);
    });

    return wrap;
}

function saveNewNpc(parsed, name) {
    if (typeof window.NPCBank !== "undefined" && window.NPCBank.getNpcBank) {
        const bank = window.NPCBank.getNpcBank();
        const { npcCreateRecord, saveNpcBank } = await import("../../features/npc/data.js");
        const record = npcCreateRecord({ parsed, name, messageIndex: 0 });
        bank.npcs.push(record);
        saveNpcBank(bank);
        window.toastr?.success(`Saved ${name} to NPC Bank`);
        if (typeof window.refreshNpcBankPanel === "function") window.refreshNpcBankPanel();
    }
}

// ────────────────────────────────────────────────────────────────────────────
// NPC Bank (saved NPCs)
// ────────────────────────────────────────────────────────────────────────

function renderNpcBank(ctx) {
    if (noChat(ctx)) return null;
    const bank = ctx.profile?.npcBank;
    if (!bank) return null;
    const npcs = bank.npcs || [];
    if (!npcs.length) return null;

    const wrap = el("div", { class: "npc-bank-saved-list" });

    // Open Book button
    const openBookBtn = el("button", {
        class: "npc-bank-book-btn",
        onclick: () => ctx.openNpcBook(),
    },
        el("i", { class: "fa-solid fa-book-open" }),
        " Open NPC Book",
        npcs.length ? el("span", { class: "npc-bank-book-count" }, String(npcs.length)) : null,
    );
    wrap.appendChild(openBookBtn);

    const grid = el("div", { class: "npc-bank-grid" });
    // Newest first (matches the NPC Book's reverse-iteration pattern)
    [...npcs].reverse().forEach((n, revIdx) => {
        const idx = npcs.length - 1 - revIdx;
        const male = isMaleSex(n.sex);
        const accentVar = male ? "var(--npc-bank-male, #3b82f6)" : "var(--npc-bank-female, #f43f5e)";
        
        const portrait = n.pfp
            ? el("img", { class: "npc-bank-pfp", src: n.pfp, alt: n.name || "NPC" })
            : el("div", { class: "npc-bank-pfp npc-bank-pfp-empty" },
                el("i", { class: "fa-solid fa-user-secret" })
            );

        const ageSex = [n.age, n.sex].filter(Boolean).join(" · ");

        grid.appendChild(el("div", {
            class: "npc-bank-mini",
            style: { "--accent": accentVar },
            title: "Click to open in NPC Book",
            onclick: () => ctx.openNpcBook(idx),
        },
            portrait,
            el("div", { class: "npc-bank-mini-info" },
                el("div", { class: "npc-bank-mini-name" }, n.name || "Unnamed"),
                ageSex ? el("div", { class: "npc-bank-mini-meta" }, ageSex) : null,
                (n.role || n.occupation)
                    ? el("div", { class: "npc-bank-mini-occ" }, n.role || n.occupation)
                    : null,
            ),
        ));
    });
    wrap.appendChild(grid);
    return wrap;
}

// ────────────────────────────────────────────────────────────────────────────
// Registry — panel.js iterates this
// ────────────────────────────────────────────────────────────────────────

export const SECTION_REGISTRY = [
    {
        id: "newNpcs",
        icon: "fa-user-plus",
        title: "New NPC Dossiers",
        defaultOpen: true,
        order: 0,
        render: renderNewNpcs,
        badge: (ctx) => ctx.parsed?.newNpcs?.length || null,
        inlineBlockNames: ["New_NPC"],
    },
    {
        id: "npcBank",
        icon: "fa-address-book",
        title: "NPC Bank",
        defaultOpen: true,
        order: 1,
        render: renderNpcBank,
        badge: (ctx) => ctx.profile?.npcBank?.npcs?.length || null,
    },
];