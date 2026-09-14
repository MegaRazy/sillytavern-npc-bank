// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Data Layer (Parsing, Serialization, Scoring)
// ────────────────────────────────────────────────────────────────────────

import { getContext } from "../../../../extensions.js";
import { escapeRegex } from "../../utils/regex.js";
import {
    npcFields, npcFieldByRole, npcBodyFields, npcVitalsFields,
    npcUpdatableFields, npcLockedFields
} from "./fields.js";

const EXTENSION_NAME = "NPC-Bank";
const NPC_BANK_KEY = "npcBank";

// ────────────────────────────────────────────────────────────────────────────
// STORAGE HELPERS
// ────────────────────────────────────────────────────────────────────────

/** Get NPC bank from localProfile */
export function getNpcBank() {
    const context = getContext();
    if (!context?.chat) return { npcs: [], version: 1, enabled: true };

    // Check localProfile first (loaded from chat_metadata)
    if (typeof localProfile !== "undefined" && localProfile.npcBank) {
        return localProfile.npcBank;
    }

    // Fallback to chat_metadata
    const meta = context.chat.metadata || {};
    const extMeta = meta[EXTENSION_NAME] || {};
    const bank = extMeta[NPC_BANK_KEY] || { npcs: [], version: 1, enabled: true };

    return bank;
}

/** Save NPC bank to localProfile and chat_metadata */
export function saveNpcBank(bank) {
    const context = getContext();
    if (!context?.chat) return;

    // Update localProfile
    if (typeof localProfile !== "undefined") {
        localProfile.npcBank = bank;
    }

    // Save to chat_metadata
    if (!context.chat.metadata) context.chat.metadata = {};
    if (!context.chat.metadata[EXTENSION_NAME]) context.chat.metadata[EXTENSION_NAME] = {};
    context.chat.metadata[EXTENSION_NAME][NPC_BANK_KEY] = bank;

    if (typeof window.saveMetadata === "function") {
        window.saveMetadata(context.chat.id, context.chat.metadata);
    }
}

/** Create a fresh NPC record with all field keys + bookkeeping */
export function npcCreateRecord({ parsed = {}, name = "", messageIndex = 0 } = {}) {
    const nameField = npcFieldByRole("name");
    const record = {};

    npcFields().forEach(f => { record[f.id] = parsed[f.id] || ""; });
    if (nameField) record[nameField.id] = parsed[nameField.id] || name || "";

    record.imageOnly = false;
    record.pfp = "";
    record.timestamp = Date.now();
    record.messageIndex = messageIndex;
    record.history = [];

    return record;
}

// ────────────────────────────────────────────────────────────────────────────
// PARSING: <New_NPC> block → structured data
// ────────────────────────────────────────────────────────────────────────

/** Parse raw NPC dossier block (HTML or text) into structured fields */
export function npcParseBlock(blockHtml) {
    if (!blockHtml) return {};

    let text = blockHtml
        .replace(/<[^>]+>/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, '"')
        .replace(/'/g, "'")
        .trim();

    const parsed = {};

    npcFields().forEach(field => {
        if (field.system === "imageTags") return;

        const label = escapeRegex(field.label);
        const id = field.id;

        if (field.ownLine) {
            const regex = new RegExp(`\\*\\*${label}:\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*|$)`, "i");
            const match = text.match(regex);
            if (match) parsed[id] = match[1].trim();
        } else {
            const regex = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]*)`, "i");
            const match = text.match(regex);
            if (match) parsed[id] = match[1].trim();
        }
    });

    // Special handling for vitals sub-fields
    const vitalsField = npcFieldByRole("vitals");
    if (vitalsField?.subFields) {
        const headerRegex = /\*\*Name:\*\*\s*([^|]+)(?:\|\s*\*\*Age:\*\*\s*([^|]+))?(?:\|\s*\*\*Sex:\*\*\s*([^|]+))?(?:\|\s*\*\*Orientation:\*\*\s*([^|]+))?/i;
        const headerMatch = text.match(headerRegex);
        if (headerMatch) {
            if (headerMatch[1]) parsed.name = headerMatch[1].trim();
            vitalsField.subFields.forEach((sub, i) => {
                if (headerMatch[i + 2]) parsed[sub.id] = headerMatch[i + 2].trim();
            });
        }
    }

    return parsed;
}

/** Extract all <New_NPC> blocks from a message */
export function npcExtractNewNpcBlocks(message) {
    if (!message) return [];

    const blocks = [];
    const regex = /<New_NPC\b[^>]*>([\s\S]*?)<\/New_NPC>/gi;
    let match;

    while ((match = regex.exec(message)) !== null) {
        const attrs = match[0].match(/<New_NPC\b([^>]*)>/i);
        const nameAttr = attrs?.[1]?.match(/name\s*=\s*["']([^"']+)["']/i);
        const name = nameAttr?.[1] || "";
        blocks.push({ html: match[1], name });
    }

    return blocks;
}

// ────────────────────────────────────────────────────────────────────────────
// SERIALIZATION: structured data → text for prompt injection
// ────────────────────────────────────────────────────────────────────────

/** Reconstruct plain-text dossier from structured NPC data */
export function npcBuildTextFromData(n) {
    if (!n) return "";

    const lines = [];

    const nameField = npcFieldByRole("name");
    const headerParts = [];
    if (nameField) headerParts.push(`**${nameField.label}:** ${n[nameField.id] || "Unknown"}`);
    npcVitalsFields().forEach(f => headerParts.push(`**${f.label}:** ${n[f.id] || "?"}`));
    if (headerParts.length) lines.push(headerParts.join(" | "));

    npcBodyFields().forEach(f => {
        if (f.system === "imageTags") return;
        const val = n[f.id];
        if (!val) return;
        lines.push(f.ownLine ? `**${f.label}:**\n${val}` : `**${f.label}:** ${val}`);
    });

    return lines.join("\n");
}

/** Build the full NPC list block for prompt injection */
export function npcBuildListBlock(bank) {
    if (!bank?.npcs?.length) return "";

    const entries = bank.npcs
        .filter(n => n.name && n.name.trim())
        .map(n => npcBuildTextFromData(n))
        .filter(t => t.trim())
        .join("\n\n---\n\n");

    return entries ? `<Blocks>\n<npc_list>\n${entries}\n</npc_list>\n</Blocks>` : "";
}

// ────────────────────────────────────────────────────────────────────────────
// AUTO-EXTRACTION: Scan AI reply for <New_NPC> blocks
// ────────────────────────────────────────────────────────────────────────

/** Process AI reply: extract NPCs, add/update bank, return updated bank */
export function npcProcessReply(replyText, messageIndex = 0) {
    const bank = getNpcBank();
    const blocks = npcExtractNewNpcBlocks(replyText);

    for (const block of blocks) {
        const parsed = npcParseBlock(block.html);
        const existingIdx = bank.npcs.findIndex(n => n.name?.toLowerCase() === (parsed.name || block.name)?.toLowerCase());

        if (existingIdx >= 0) {
            continue; // canon lock
        }

        const record = npcCreateRecord({ parsed, name: block.name, messageIndex });
        bank.npcs.push(record);
    }

    if (blocks.length) saveNpcBank(bank);
    return bank;
}

// ────────────────────────────────────────────────────────────────────────────
// TF-IDF SCORING: Find NPCs relevant to current context
// ────────────────────────────────────────────────────────────────────────

function extractKeywords(messages, maxKeywords = 20) {
    if (!messages?.length) return [];

    const stopWords = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "can", "this", "that", "these",
        "those", "i", "you", "he", "she", "it", "we", "they", "me", "him",
        "her", "us", "them", "my", "your", "his", "her", "its", "our", "their"
    ]);

    const freq = {};
    const recent = messages.slice(-10);

    recent.forEach(m => {
        const text = (m.mes || m.content || "").toLowerCase();
        const words = text.match(/\b[a-z]{3,}\b/g) || [];
        words.forEach(w => {
            if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
        });
    });

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxKeywords)
        .map(([w]) => w);
}

/** Score NPCs against keywords, return top N with imageTags */
export function npcBuildRelevantImageTags(bank, messages, topN = 3) {
    if (!bank?.npcs?.length) return "";

    const keywords = extractKeywords(messages);
    if (!keywords.length) return "";

    let scoredNpcs = [];
    bank.npcs.forEach(n => {
        if (!n.imageTags || n.imageTags.trim() === "") return;
        const contentLower = npcBuildTextFromData(n).toLowerCase();
        let score = 0;
        for (const kw of keywords) {
            if (contentLower.includes(kw)) score++;
        }
        if (n.name && keywords.some(k => n.name.toLowerCase().includes(k))) score += 50;
        if (score >= 1) scoredNpcs.push({ name: n.name, tags: n.imageTags, score });
    });

    if (!scoredNpcs.length) return "";

    scoredNpcs.sort((a, b) => b.score - a.score);
    const topNpcs = scoredNpcs.slice(0, topN);

    return "**RELEVANT NPC IMAGE TAGS:**\n" + topNpcs.map(n => `[${n.name}]: ${n.tags}`).join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORT / IMPORT
// ────────────────────────────────────────────────────────────────────────

/** Export NPC bank as JSON string */
export function npcExportBank(bank) {
    return JSON.stringify(bank, null, 2);
}

/** Import NPC bank from JSON string */
export function npcImportBank(jsonStr, merge = false) {
    let bank;
    try {
        bank = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error("Invalid NPC bank JSON");
    }

    if (!bank.npcs || !Array.isArray(bank.npcs)) {
        throw new Error("Invalid bank structure: missing npcs array");
    }

    const current = getNpcBank();
    if (merge) {
        const byName = new Map(current.npcs.map(n => [n.name?.toLowerCase(), n]));
        bank.npcs.forEach(n => {
            const key = n.name?.toLowerCase();
            if (!key) return;
            const existing = byName.get(key);
            if (!existing || (n.timestamp || 0) > (existing.timestamp || 0)) {
                byName.set(key, n);
            }
        });
        current.npcs = Array.from(byName.values());
    } else {
        current.npcs = bank.npcs;
    }

    saveNpcBank(current);
    return current;
}