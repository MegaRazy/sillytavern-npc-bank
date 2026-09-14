// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Update Processing (<NPC_Update> blocks)
// ────────────────────────────────────────────────────────────────────────

import { escapeRegex } from "../../utils/regex.js";
import {
    npcFields, npcFieldByRole, npcUpdatableFields, npcLockedFields,
    npcSingleValueFields, npcMultiValueFields
} from "./fields.js";
import { getNpcBank, saveNpcBank, npcBuildTextFromData } from "./data.js";

const EXTENSION_NAME = "NPC-Bank";

// ────────────────────────────────────────────────────────────────────────────
// PARSE <NPC_Update> BLOCKS
// ────────────────────────────────────────────────────────────────────────

/** Extract all <NPC_Update> blocks from a message */
export function npcParseUpdateBlocks(message) {
    if (!message) return [];

    const blocks = [];
    const regex = /<NPC_Update\b[^>]*>([\s\S]*?)<\/NPC_Update>/gi;
    let match;

    while ((match = regex.exec(message)) !== null) {
        const fullBlock = match[0];
        const content = match[1].trim();

        const nameMatch = fullBlock.match(/<NPC_Update\b[^>]*name\s*=\s*["']([^"']+)["']/i);
        const name = nameMatch?.[1]?.trim();

        if (!name) continue;

        const operations = [];
        const opRegex = /^([~+-])\s*\*\*([^*]+):\*\*\s*(.+)$/gm;
        let opMatch;

        while ((opMatch = opRegex.exec(content)) !== null) {
            operations.push({
                op: opMatch[1],
                fieldLabel: opMatch[2].trim(),
                value: opMatch[3].trim()
            });
        }

        blocks.push({ name, operations, raw: fullBlock });
    }

    return blocks;
}

// ────────────────────────────────────────────────────────────────────────────
// APPLY UPDATES TO NPC BANK
// ────────────────────────────────────────────────────────────────────────

function findFieldByLabel(label) {
    return npcFields().find(f => f.label.toLowerCase() === label.toLowerCase());
}

function applyOperation(npc, field, op, value, messageIndex) {
    const fieldId = field.id;
    const oldValue = npc[fieldId] || "";
    let newValue = oldValue;

    switch (op) {
        case "~":
            newValue = value;
            break;
        case "+":
            if (field.type === "list") {
                const entries = oldValue ? oldValue.split("\n").map(e => e.replace(/^[-*]\s*/, "").trim()).filter(Boolean) : [];
                if (!entries.includes(value)) {
                    entries.push(value);
                    newValue = entries.map(e => `- ${e}`).join("\n");
                }
            } else {
                newValue = value;
            }
            break;
        case "-":
            if (field.type === "list" && oldValue) {
                const entries = oldValue.split("\n").map(e => e.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
                const filtered = entries.filter(e => e.toLowerCase() !== value.toLowerCase());
                newValue = filtered.map(e => `- ${e}`).join("\n");
            }
            break;
    }

    if (newValue !== oldValue) {
        npc[fieldId] = newValue;
        npc.history.push({
            field: fieldId,
            fieldLabel: field.label,
            oldValue,
            newValue,
            timestamp: Date.now(),
            messageIndex
        });
        return true;
    }
    return false;
}

/** Process all <NPC_Update> blocks in a message, update the bank */
export function npcProcessUpdates(replyText, messageIndex = 0) {
    const bank = getNpcBank();
    const blocks = npcParseUpdateBlocks(replyText);
    let changed = false;

    for (const block of blocks) {
        const npcIdx = bank.npcs.findIndex(n => n.name?.toLowerCase() === block.name.toLowerCase());
        if (npcIdx === -1) {
            console.warn(`[NPC Bank] Update for unknown NPC: ${block.name}`);
            continue;
        }

        const npc = bank.npcs[npcIdx];

        for (const { op, fieldLabel, value } of block.operations) {
            const field = findFieldByLabel(fieldLabel);
            if (!field) {
                console.warn(`[NPC Bank] Unknown field label: ${fieldLabel}`);
                continue;
            }

            if (!field.updatable) {
                console.warn(`[NPC Bank] Field not updatable: ${fieldLabel}`);
                continue;
            }

            if (npcLockedFields().some(f => f.id === field.id)) {
                console.warn(`[NPC Bank] Field is locked: ${fieldLabel}`);
                continue;
            }

            if (applyOperation(npc, field, op, value, messageIndex)) {
                changed = true;
            }
        }
    }

    if (changed) {
        saveNpcBank(bank);
    }

    return { bank, changed, blocksProcessed: blocks.length };
}

// ────────────────────────────────────────────────────────────────────────────
// ROLLBACK: Undo updates from a specific message index
// ────────────────────────────────────────────────────────────────────────

/** Roll back all NPC changes made at or after a message index */
export function npcRollbackHistoryFrom(messageIndex) {
    const bank = getNpcBank();
    let changed = false;

    bank.npcs.forEach(npc => {
        if (!npc.history?.length) return;

        const keep = npc.history.filter(h => h.messageIndex < messageIndex);
        const removed = npc.history.filter(h => h.messageIndex >= messageIndex);

        if (removed.length) {
            const rebuilt = {};
            npcFields().forEach(f => { rebuilt[f.id] = ""; });

            keep.forEach(h => {
                rebuilt[h.field] = h.newValue;
            });

            Object.keys(rebuilt).forEach(k => { npc[k] = rebuilt[k]; });
            npc.history = keep;
            changed = true;
        }
    });

    if (changed) saveNpcBank(bank);
    return bank;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Build prompt injection data for update prompt
// ────────────────────────────────────────────────────────────────────────

/** Get data needed for the update prompt injection */
export function npcGetUpdatePromptData() {
    const bank = getNpcBank();
    const updatable = npcUpdatableFields();
    const locked = npcLockedFields();

    return {
        npcList: bank.npcs.map(n => npcBuildTextFromData(n)).join("\n\n---\n\n"),
        updatableFields: updatable.map(f => f.label).join(", "),
        lockedFields: locked.map(f => f.label).join(", ")
    };
}