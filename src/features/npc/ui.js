// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — NPC Book Modal (Full Editor)
// ────────────────────────────────────────────────────────────────────────

import { getContext, generateQuietPrompt, Popup, POPUP_TYPE } from "../../../../extensions.js";
import { localProfile } from "../../core/state.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { registerRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { npcFields, npcBodyFields, npcFieldByRole, npcVitalsFields, NPC_FIELD_TYPES, NPC_DEFAULT_FIELDS, npcBuildUpdatePrompt } from "./fields.js";
import { getNpcBank, saveNpcBank, npcCreateRecord, npcParseBlock, npcBuildTextFromData, npcExportBank, npcImportBank } from "./data.js";
import { npcParseUpdateBlocks, npcApplyUpdates } from "./updates.js";
import { npcGeneratePfp } from "./pfp.js";
import { downloadJsonFile } from "../../../../utils.js";
import { escapeHtmlAttr } from "../../utils/html.js";

const EXTENSION_NAME = "NPC-Bank";

// ────────────────────────────────────────────────────────────────────────────
// PANEL STATE
// ────────────────────────────────────────────────────────────────────────

let panelInitialized = false;
let fieldsEditorOpen = false;

// ────────────────────────────────────────────────────────────────────────────
// OPEN NPC BOOK
// ────────────────────────────────────────────────────────────────────────

/** Open the full NPC Book editor */
export function openNpcBook(npcIdx = undefined) {
    const nb = localProfile.npcBank;
    const npcs = nb.npcs || [];
    const npc = npcIdx !== undefined ? npcs[npcIdx] : null;
    const isNew = !npc;

    // Build form fields
    let formHtml = "";
    npcFields().forEach(f => {
        if (f.system === "imageTags") return;

        const val = npc?.[f.id] || "";
        const required = f.role === "name" ? "required" : "";
        const disabled = f.system && !isNew ? "disabled" : "";

        if (f.type === "list") {
            formHtml += `
                <div class="form-group">
                    <label>${escapeHtmlAttr(f.label)}</label>
                    <textarea class="form-control" name="${f.id}" rows="3" ${required} ${disabled} placeholder="One entry per line">${escapeHtmlAttr(val)}</textarea>
                    <small class="form-text text-muted">One entry per line</small>
                </div>
            `;
        } else if (f.type === "longtext") {
            formHtml += `
                <div class="form-group">
                    <label>${escapeHtmlAttr(f.label)}</label>
                    <textarea class="form-control" name="${f.id}" rows="4" ${required} ${disabled}>${escapeHtmlAttr(val)}</textarea>
                </div>
            `;
        } else if (f.role === "vitals" && f.subFields) {
            formHtml += `<div style="display: flex; gap: 8px;">`;
            f.subFields.forEach(sub => {
                const subVal = npc?.[sub.id] || "";
                formHtml += `
                    <div class="form-group" style="flex: 1;">
                        <label>${escapeHtmlAttr(sub.label)}</label>
                        <input type="text" class="form-control" name="${sub.id}" value="${escapeHtmlAttr(subVal)}" ${disabled}>
                    </div>
                `;
            });
            formHtml += `</div>`;
        } else {
            formHtml += `
                <div class="form-group">
                    <label>${escapeHtmlAttr(f.label)}</label>
                    <input type="text" class="form-control" name="${f.id}" value="${escapeHtmlAttr(val)}" ${required} ${disabled}>
                </div>
            `;
        }
    });

    const $content = $(`
        <div style="max-height: 75vh; overflow-y: auto; padding-right: 10px;">
            <form id="npc_book_form">${formHtml}</form>
        </div>
    `);

    new Popup($content, POPUP_TYPE.CONFIRM, isNew ? "Add New NPC" : `Edit NPC: ${escapeHtmlAttr(npc.name)}`, {
        okButton: isNew ? "Create NPC" : "Save Changes",
        cancelButton: "Cancel",
        wide: true,
        large: true
    }).show().then(confirmed => {
        if (!confirmed) return;

        const formData = {};
        $content.find("[name]").each(function() {
            const field = $(this).attr("name");
            let val = $(this).val().trim();
            if ($(this).is("textarea")) {
                val = val.split("\n").map(l => l.trim()).filter(Boolean).map(l => l.startsWith("- ") ? l : `- ${l}`).join("\n");
            }
            formData[field] = val;
        });

        if (!formData.name) {
            window.toastr?.error("Name is required");
            return;
        }

        // Check for duplicate (on create)
        if (isNew && npcs.some(n => n.name.toLowerCase() === formData.name.toLowerCase())) {
            window.toastr?.error("An NPC with this name already exists");
            return;
        }

        const record = npcCreateRecord({ parsed: formData, name: formData.name, messageIndex: 0 });
        if (!isNew) {
            const idx = npcs.findIndex(n => n.name === npc.name);
            if (idx >= 0) {
                record.history = npc.history;
                record.pfp = npc.pfp;
                record.imageOnly = npc.imageOnly;
                record.timestamp = npc.timestamp;
                npcs[idx] = record;
            }
        } else {
            npcs.push(record);
        }

        saveNpcBank(nb);
        window.toastr?.success(isNew ? "NPC created" : "NPC updated");
        fireRefreshHook(REFRESH.NPC_BANK);
    });
}

// ────────────────────────────────────────────────────────────────────────────
// REGISTER GLOBAL REFRESH
// ────────────────────────────────────────────────────────────────────────

registerRefreshHook(REFRESH.NPC_BANK, () => {
    // Panel refresh handled by panel.js
});

window.openNpcBook = openNpcBook;
window.refreshNpcBankPanel = () => {
    if (typeof window.NPCBankDebug?.render === "function") {
        window.NPCBankDebug.render();
    }
};