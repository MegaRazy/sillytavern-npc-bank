/* eslint-disable no-undef */
// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Side Panel Parsers
// ────────────────────────────────────────────────────────────────────────

import { escapeHtml } from "./dom.js";
import { escapeRegex } from "../../utils/regex.js";
import { npcParseBlock, npcParseUpdateBlocks } from "../../features/npc/data.js";
import { npcFields, npcBodyFields, npcFieldByRole, npcVitalsFields } from "../../features/npc/fields.js";

/** Find the last assistant message in chat */
export function findLastAssistantMessage() {
    const messages = document.querySelectorAll("#chat > .mes_row:not(.is_user):not(.is_system)");
    return messages[messages.length - 1] || null;
}

/** Get parsed block counts from latest message */
export function getParsedBlockCounts(msg) {
    if (!msg) return {};
    const text = msg.querySelector(".mes_text")?.textContent || "";
    const counts = {};
    const regex = /<(\w+)[^>]*>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        counts[match[1]] = (counts[match[1]] || 0) + 1;
    }
    return counts;
}

/** Get parsed block types from latest message */
export function getParsedBlockTypes(msg) {
    if (!msg) return [];
    const text = msg.querySelector(".mes_text")?.textContent || "";
    const types = [];
    const regex = /<(\w+)[^>]*>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (!types.includes(match[1])) types.push(match[1]);
    }
    return types;
}

/** Parse a message for NPC blocks */
export function parseMessage(msg) {
    if (!msg) return { newNpcs: [], npcUpdates: [] };

    const text = msg.querySelector(".mes_text")?.textContent || "";
    
    // Extract <New_NPC> blocks
    const newNpcs = [];
    const newNpcRegex = /<New_NPC\b[^>]*>([\s\S]*?)<\/New_NPC>/gi;
    let match;
    while ((match = newNpcRegex.exec(text)) !== null) {
        const attrs = match[0].match(/<New_NPC\b([^>]*)>/i);
        const nameAttr = attrs?.[1]?.match(/name\s*=\s*["']([^"']+)["']/i);
        const name = nameAttr?.[1] || "";
        const parsed = npcParseBlock(match[1]);
        newNpcs.push({ name, parsed, raw: match[0] });
    }

    // Extract <NPC_Update> blocks
    const npcUpdates = [];
    const updateRegex = /<NPC_Update\b[^>]*>([\s\S]*?)<\/NPC_Update>/gi;
    while ((match = updateRegex.exec(text)) !== null) {
        const attrs = match[0].match(/<NPC_Update\b([^>]*)>/i);
        const nameAttr = attrs?.[1]?.match(/name\s*=\s*["']([^"']+)["']/i);
        const name = nameAttr?.[1] || "";
        const parsed = npcParseUpdateBlocks(match[0]);
        npcUpdates.push({ name, parsed, raw: match[0] });
    }

    return { newNpcs, npcUpdates };
}

/** Parse Story Tracker block (placeholder for compatibility) */
export function parseStoryTracker(msg) {
    if (!msg) return null;
    const text = msg.querySelector(".mes_text")?.textContent || "";
    const match = text.match(/<Story_Tracker[^>]*>([\s\S]*?)<\/Story_Tracker\s*>/i);
    return match ? match[1] : null;
}