/* eslint-disable no-undef */
// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Main Entry Point (Megumin-style)
// ────────────────────────────────────────────────────────────────────────

import { extension_settings, getContext } from "../../../extensions.js";
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
    generateQuietPrompt,
} from "../../../../script.js";
import { Popup, POPUP_TYPE } from "../../../../popup.js";
import { downloadJsonFile } from "../../../../utils.js";

import { extensionName, extensionFolderPath } from "./src/core/constants.js";
import { localProfile, setLocalProfile, _loadedProfileKey, setLoadedProfileKey } from "./src/core/state.js";
import { getCharacterKey, getRawAvatar, getAvatarKey, getParentChatKey, getProfileLevel } from "./src/core/keys.js";
import { initProfile, saveProfileToMemory, flushProfileSettingsToLoadedKey, saveProfileDebounced } from "./src/core/profile.js";
import { registerRefreshHook, REFRESH } from "./src/core/refreshHooks.js";
import { npcBuildTextFromData, npcParseBlock, npcCreateRecord, getNpcBank, saveNpcBank, npcProcessReply, npcProcessUpdates, npcBuildListBlock, npcBuildRelevantImageTags, npcRollbackHistoryFrom, npcExtractNewNpcBlocks } from "./src/features/npc/data.js";
import { npcParseUpdateBlocks, npcApplyUpdates } from "./src/features/npc/updates.js";
import { initSidePanel } from "./src/sidepanel/panel.js";
import { escapeRegex } from "./src/utils/regex.js";
import { escapeHtmlAttr } from "./src/utils/html.js";

const EXT_NAME = "NPC-Bank";
const NPC_BANK_KEY = "npcBank";

// ────────────────────────────────────────────────────────────────────────────
// SETTINGS DEFAULTS
// ────────────────────────────────────────────────────────────────────────

const DEFAULT_NPC_BANK_SETTINGS = Object.freeze({
    enabled: true,
    autoExtract: true,
    autoUpdate: true,
    injectNpcList: true,
    injectImageTags: true,
    maxRelevantNpcs: 3,
    oocTrigger: false,
    sendPortraitsToAi: false,
    injectionLimit: 3,
});

// ────────────────────────────────────────────────────────────────────────────
// GLOBAL INTERCEPTOR (generate_interceptor)
// ────────────────────────────────────────────────────────────────────────

/**
 * Prompt interceptor called by SillyTavern before each generation
 * Signature: (chat, _contextSize, _abort, type)
 */
window.npcBankInterceptor = function (chat, _contextSize, _abort, type) {
    const settings = getNpcBankSettings();
    if (!settings.enabled) return;

    if (!chat || !Array.isArray(chat)) return;

    const context = getContext();
    if (!context?.chat) return;

    // Build injection blocks
    const bank = getNpcBank();
    const blocks = [];

    // Inject NPC list block
    if (settings.injectNpcList && bank.npcs?.length) {
        const npcListBlock = npcBuildListBlock(bank);
        if (npcListBlock) blocks.push(npcListBlock);
    }

    // Inject relevant image tags for ComfyUI
    if (settings.injectImageTags && bank.npcs?.length) {
        const imageTags = npcBuildRelevantImageTags(bank, context.chat.messages, settings.maxRelevantNpcs);
        if (imageTags) blocks.push(`<Blocks>\n${imageTags}\n</Blocks>`);
    }

    // Prepend blocks to the first system message, or create one
    if (blocks.length) {
        const blocksText = blocks.join("\n\n");

        // Find first system message
        let systemIdx = chat.findIndex(m => m.role === "system" || m.is_system);
        if (systemIdx >= 0) {
            chat[systemIdx] = { ...chat[systemIdx] };
            chat[systemIdx].mes = (chat[systemIdx].mes || "") + "\n\n" + blocksText;
        } else {
            // Prepend as system message
            chat.unshift({ 
                is_system: true, 
                mes: blocksText,
                name: "System",
                send_date: Date.now()
            });
        }
    }
};

// ────────────────────────────────────────────────────────────────────────────
// SETTINGS HELPERS
// ────────────────────────────────────────────────────────────────────────

function getNpcBankSettings() {
    if (!extension_settings[extensionName]) extension_settings[extensionName] = {};
    if (!extension_settings[extensionName].npcBank) {
        extension_settings[extensionName].npcBank = { ...DEFAULT_NPC_BANK_SETTINGS };
        saveSettingsDebounced();
    }
    return { ...DEFAULT_NPC_BANK_SETTINGS, ...extension_settings[extensionName].npcBank };
}

function setNpcBankSettings(partial) {
    if (!extension_settings[extensionName]) extension_settings[extensionName] = {};
    extension_settings[extensionName].npcBank = {
        ...getNpcBankSettings(),
        ...partial
    };
    saveSettingsDebounced();
}

// ────────────────────────────────────────────────────────────────────────────
// EVENT HANDLERS
// ────────────────────────────────────────────────────────────────────────

/** Handle incoming model message — extract NPCs */
function onMessageReceived(message) {
    const settings = getNpcBankSettings();
    if (!settings.enabled || !settings.autoExtract) return;
    if (message.is_user) return;
    if (!message.mes) return;

    const context = getContext();
    const msgIndex = context.chat.messages.findIndex(m => m === message);
    npcProcessReply(message.mes, msgIndex);
}

/** Handle chat switch */
function onChatChanged() {
    const settings = getNpcBankSettings();
    if (settings.enabled) {
        // The chat switch logic in initProfile handles loading
    }
}

/** Handle message deletion/branching — rollback NPC history */
function onMessageDeleted(messageIndex) {
    npcRollbackHistoryFrom(messageIndex);
}

// ────────────────────────────────────────────────────────────────────────────
// SIDE PANEL INTEGRATION
// ────────────────────────────────────────────────────────────────────────

let sidePanelInitialized = false;

/** Initialize the side panel */
function initNpcBankSidePanel() {
    if (sidePanelInitialized) return;
    sidePanelInitialized = true;

    // Initialize Megumin-style side panel with our profile getter
    initSidePanel({ profileGetter: () => localProfile });
}

// ────────────────────────────────────────────────────────────────────────────
// EXTENSION LIFECYCLE HOOKS
// ────────────────────────────────────────────────────────────────────────

/** Called when extension is activated (enabled) */
export function onActivate() {
    console.log("[NPC Bank] Activating...");

    // Ensure settings exist
    getNpcBankSettings();

    // Initialize profile system
    initProfile();

    // Initialize side panel
    initNpcBankSidePanel();

    // Register event listeners
    if (typeof eventSource !== "undefined" && typeof event_types !== "undefined") {
        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        eventSource.on(event_types.MESSAGE_DELETED, onMessageDeleted);
        eventSource.on(event_types.MESSAGE_SWIPED, onMessageDeleted); // branching
    }

    // Register refresh hooks
    registerRefreshHook(REFRESH.NPC_BANK, () => {
        if (typeof window.refreshNpcBankPanel === "function") {
            window.refreshNpcBankPanel();
        }
    });

    console.log("[NPC Bank] Activated");
}

/** Called when extension is disabled */
export function onDisable() {
    console.log("[NPC Bank] Disabling...");

    if (typeof eventSource !== "undefined" && typeof event_types !== "undefined") {
        eventSource.off(event_types.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.off(event_types.CHAT_CHANGED, onChatChanged);
        eventSource.off(event_types.MESSAGE_DELETED, onMessageDeleted);
        eventSource.off(event_types.MESSAGE_SWIPED, onMessageDeleted);
    }

    console.log("[NPC Bank] Disabled");
}

// ────────────────────────────────────────────────────────────────────────────
// SETTINGS UI (Extensions panel)
// ────────────────────────────────────────────────────────────────────────

/** Register settings UI in Extensions panel */
export function registerSettings() {
    const context = getContext();
    if (!context?.extensionSettings?.register) return;

    context.extensionSettings.register({
        extension: extensionName,
        label: "NPC Bank",
        tabs: [
            {
                id: "behavior",
                label: "Behavior",
                render: ($container) => {
                    const s = getNpcBankSettings();
                    $container.append(`
                        <div class="form-group">
                            <label class="form-check">
                                <input type="checkbox" class="form-check-input" id="setting-enabled" ${s.enabled ? "checked" : ""}>
                                <span class="form-check-label">Enable NPC Bank</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="form-check">
                                <input type="checkbox" class="form-check-input" id="setting-autoExtract" ${s.autoExtract ? "checked" : ""}>
                                <span class="form-check-label">Auto-extract NPCs from AI replies</span>
                            </label>
                            <small class="form-text text-muted">When the AI outputs <New_NPC> blocks, automatically save them to the bank.</small>
                        </div>
                        <div class="form-group">
                            <label class="form-check">
                                <input type="checkbox" class="form-check-input" id="setting-autoUpdate" ${s.autoUpdate ? "checked" : ""}>
                                <span class="form-check-label">Process <NPC_Update> blocks from AI</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="form-check">
                                <input type="checkbox" class="form-check-input" id="setting-injectNpcList" ${s.injectNpcList ? "checked" : ""}>
                                <span class="form-check-label">Inject NPC list into prompt</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="form-check">
                                <input type="checkbox" class="form-check-input" id="setting-injectImageTags" ${s.injectImageTags ? "checked" : ""}>
                                <span class="form-check-label">Inject relevant imageTags for ComfyUI</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label>Max relevant NPCs for imageTags</label>
                            <input type="number" class="form-control input-sm" id="setting-maxRelevantNpcs" value="${s.maxRelevantNpcs}" min="1" max="10" style="width: 80px;">
                        </div>
                        <hr>
                        <div class="form-group">
                            <label class="form-check">
                                <input type="checkbox" class="form-check-input" id="setting-oocTrigger" ${s.oocTrigger ? "checked" : ""}>
                                <span class="form-check-label">OOC Trigger (Manual Extract)</span>
                            </label>
                            <small class="form-text text-muted">When ON, Dossier Template ONLY injects if 'NPC' or 'dossier' is in your latest message.</small>
                        </div>
                        <div class="form-group">
                            <label class="form-check">
                                <input type="checkbox" class="form-check-input" id="setting-sendPortraitsToAi" ${s.sendPortraitsToAi ? "checked" : ""}>
                                <span class="form-check-label">Send Portraits to AI (Multimodal)</span>
                            </label>
                            <small class="form-text text-muted">If an injected NPC has a portrait, send the image to the AI vision model.</small>
                        </div>
                    `);

                    $container.find("input[type=checkbox]").on("change", function() {
                        setNpcBankSettings({ [this.id.replace("setting-", "")]: this.checked });
                    });
                    $container.find("#setting-maxRelevantNpcs").on("change", function() {
                        setNpcBankSettings({ maxRelevantNpcs: parseInt(this.value) || 3 });
                    });
                }
            },
            {
                id: "advanced",
                label: "Advanced",
                render: ($container) => {
                    $container.append(`
                        <div class="form-group">
                            <button class="btn btn-outline-danger btn-sm" id="npc-bank-reset">Reset NPC Bank (Current Chat)</button>
                            <button class="btn btn-outline-secondary btn-sm ms-2" id="npc-bank-reset-all">Reset ALL Settings</button>
                        </div>
                        <hr>
                        <div class="form-group">
                            <button class="btn btn-primary btn-sm" id="npc-bank-export">Export NPC Bank (JSON)</button>
                            <button class="btn btn-secondary btn-sm ms-2" id="npc-bank-import">Import NPC Bank (JSON)</button>
                        </div>
                        <hr>
                        <div class="form-group">
                            <button class="btn btn-secondary btn-sm" id="npc-bank-scan">Scan Story for NPCs</button>
                        </div>
                    `);

                    $container.on("click", "#npc-bank-reset", () => {
                        if (confirm("Clear all NPCs in current chat?")) {
                            saveNpcBank({ npcs: [], version: 1, enabled: true });
                            window.toastr?.success("NPC bank cleared for this chat");
                        }
                    });
                    $container.on("click", "#npc-bank-reset-all", () => {
                        if (confirm("Reset ALL NPC Bank settings to defaults?")) {
                            extension_settings[extensionName].npcBank = { ...DEFAULT_NPC_BANK_SETTINGS };
                            saveSettingsDebounced();
                            window.toastr?.success("Settings reset");
                            setTimeout(() => location.reload(), 500);
                        }
                    });
                    $container.on("click", "#npc-bank-export", () => {
                        const bank = getNpcBank();
                        const json = JSON.stringify(bank, null, 2);
                        downloadJsonFile(json, "npc-bank.json");
                        window.toastr?.success(`Exported ${bank.npcs.length} NPCs`);
                    });
                    $container.on("click", "#npc-bank-import", () => {
                        const input = $("<input type='file' accept='.json' style='display:none;'>");
                        $("body").append(input);
                        input.on("change", async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const text = await file.text();
                            try {
                                const merge = confirm("Merge with existing NPCs? (Cancel = replace all)");
                                const data = JSON.parse(text);
                                if (data.npcs) {
                                    const bank = getNpcBank();
                                    if (merge) {
                                        const byName = new Map(bank.npcs.map(n => [n.name?.toLowerCase(), n]));
                                        data.npcs.forEach(n => {
                                            const key = n.name?.toLowerCase();
                                            if (!key) return;
                                            const existing = byName.get(key);
                                            if (!existing || (n.timestamp || 0) > (existing.timestamp || 0)) {
                                                byName.set(key, n);
                                            }
                                        });
                                        bank.npcs = Array.from(byName.values());
                                    } else {
                                        bank.npcs = data.npcs;
                                    }
                                    saveNpcBank(bank);
                                }
                                window.toastr?.success("Import successful");
                                if (typeof window.refreshNpcBankPanel === "function") window.refreshNpcBankPanel();
                            } catch (err) {
                                window.toastr?.error("Import failed: " + err.message);
                            }
                            input.remove();
                        });
                        input.trigger("click");
                    });
                    $container.on("click", "#npc-bank-scan", async () => {
                        const btn = $container.find("#npc-bank-scan");
                        btn.prop("disabled", true).html('<i class="fa fa-spinner fa-spin"></i> Scanning...');
                        try {
                            await scanStoryForNpcs();
                            window.toastr?.success("Story scan complete");
                            if (typeof window.refreshNpcBankPanel === "function") window.refreshNpcBankPanel();
                        } catch (e) {
                            window.toastr?.error("Scan failed: " + e.message);
                        } finally {
                            btn.prop("disabled", false).html('<i class="fa fa-search"></i> Scan Story for NPCs');
                        }
                    });
                }
            }
        ]
    });
}

/** Scan story for NPCs (called from settings) */
async function scanStoryForNpcs() {
    const context = getContext();
    if (!context?.chat?.messages) return 0;

    const bank = getNpcBank();
    const existingNames = new Set(bank.npcs.map(n => n.name.toLowerCase()));
    let found = 0;

    for (let i = 0; i < context.chat.messages.length; i++) {
        const msg = context.chat.messages[i];
        if (msg.is_user || !msg.mes) continue;

        const blocks = npcExtractNewNpcBlocks(msg.mes);
        for (const block of blocks) {
            const name = (block.name || "").toLowerCase();
            if (name && !existingNames.has(name)) {
                const parsed = npcParseBlock(block.html);
                const record = npcCreateRecord({ parsed, name: block.name, messageIndex: i });
                bank.npcs.push(record);
                existingNames.add(name);
                found++;
            }
        }
    }

    if (found) saveNpcBank(bank);
    return found;
}

// ────────────────────────────────────────────────────────────────────────────
// PROMPT MACROS (for user presets)
// ────────────────────────────────────────────────────────────────────────

/** Register custom prompt macros */
async function registerPromptMacros() {
    const context = getContext();
    if (!context?.promptMacros) return;

    const { npcFields, npcFieldByRole, npcBodyFields, npcVitalsFields, npcUpdatableFields, npcLockedFields, npcBuildDossierTemplate, npcBuildPersistenceRule } = await import("./src/features/npc/fields.js");
    const { NPC_BANK_PROMPTS } = await import("./src/prompts/npcBank.js");
    const { npcGetUpdatePromptData } = await import("./src/features/npc/updates.js");

    // {{npc_dossier_prompt}}
    context.promptMacros.register("npc_dossier_prompt", () => {
        const settings = getNpcBankSettings();
        if (!settings.enabled) return "";
        const { systemPrompt, userPrompt, template, persistenceRule } = NPC_BANK_PROMPTS.dossier;
        return `[[system]]\n${systemPrompt}\n\n[[user]]\n${userPrompt
            .replace("{{template}}", template)
            .replace("{{persistenceRule}}", persistenceRule)}`;
    });

    // {{npc_update_prompt}}
    context.promptMacros.register("npc_update_prompt", () => {
        const settings = getNpcBankSettings();
        if (!settings.enabled) return "";
        const { systemPrompt, userPrompt } = NPC_BANK_PROMPTS.update;
        const data = npcGetUpdatePromptData();
        return `[[system]]\n${systemPrompt}\n\n[[user]]\n${userPrompt
            .replace("{{npc_list}}", data.npcList)
            .replace("{{updatable_fields}}", data.updatableFields)
            .replace("{{locked_fields}}", data.lockedFields)}`;
    });

    // {{npc_portrait_prompt}}
    context.promptMacros.register("npc_portrait_prompt", () => {
        const settings = getNpcBankSettings();
        if (!settings.enabled) return "";
        const { systemPrompt, userPrompt, thinkingPrompt } = NPC_BANK_PROMPTS.portrait;
        return `[[system]]\n${systemPrompt}\n\n[[user]]\n${userPrompt}\n\n[[thinking]]\n${thinkingPrompt}`;
    });

    // {{npc_list}}
    context.promptMacros.register("npc_list", () => {
        const bank = getNpcBank();
        return bank.npcs?.map(n => {
            const nameField = npcFields().find(f => f.role === "name");
            const lines = [];
            if (nameField) lines.push(`**${nameField.label}:** ${n[nameField.id] || "Unknown"}`);
            npcVitalsFields().forEach(f => lines.push(`**${f.label}:** ${n[f.id] || "?"}`));
            npcBodyFields().forEach(f => {
                if (f.system === "imageTags") return;
                const val = n[f.id];
                if (!val) return;
                lines.push(f.ownLine ? `**${f.label}:**\n${val}` : `**${f.label}:** ${val}`);
            });
            return lines.join("\n");
        }).join("\n\n---\n\n") || "";
    });
}

// ────────────────────────────────────────────────────────────────────────────
// AUTO-INIT
// ────────────────────────────────────────────────────────────────────────

// Register settings UI when extensions system is ready
if (typeof eventSource !== "undefined" && typeof event_types !== "undefined") {
    eventSource.on(event_types.APP_READY, () => {
        registerSettings();
        registerPromptMacros();
    });
}

// Export for global access
window.NPCBank = {
    getNpcBank,
    saveNpcBank,
    getNpcBankSettings,
    setNpcBankSettings,
    openNpcBook: () => { if (typeof window.openNpcBook === "function") window.openNpcBook(); },
    refreshPanel: () => { if (typeof window.refreshNpcBankPanel === "function") window.refreshNpcBankPanel(); }
};