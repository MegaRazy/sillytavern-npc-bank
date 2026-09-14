// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Profile Loading & Saving
// ────────────────────────────────────────────────────────────────────────

import { extension_settings, saveSettingsDebounced } from "../../../../extensions.js";
import { getContext } from "../../../../extensions.js";
import { localProfile, setLocalProfile, _loadedProfileKey, setLoadedProfileKey } from "./state.js";
import { getCharacterKey, getRawAvatar, getAvatarKey, getParentChatKey, getProfileLevel } from "./keys.js";
import { registerRefreshHook, REFRESH } from "./refreshHooks.js";
import { NPC_DEFAULT_FIELDS, NPC_SYSTEM_ROLES } from "../features/npc/fields.js";
import { getNpcBankSettings } from "../../index.js";

// ────────────────────────────────────────────────────────────────────────────
// DEBOUNCED SAVE
// ────────────────────────────────────────────────────────────────────────

let _saveProfileDebouncedInner = null;

export function saveProfileDebounced() {
    if (_saveProfileDebouncedInner) {
        clearTimeout(_saveProfileDebouncedInner);
    }
    _saveProfileDebouncedInner = setTimeout(() => {
        _saveProfileDebouncedInner = null;
        flushProfileSettingsToLoadedKey();
    }, 500);
}

// ────────────────────────────────────────────────────────────────────────────
// PROFILE INITIALIZATION
// ────────────────────────────────────────────────────────────────────────

/** Initialize profile for current chat */
export function initProfile() {
    const context = getContext();
    if (!context) return;

    const chatLevelKey = getCharacterKey();
    const isGroup = context.groupId !== undefined && context.groupId !== null;
    const profileLevel = isGroup ? 'group' : getProfileLevel();
    let activeKey = null;
    let fallbackKeys = [];

    if (isGroup) {
        activeKey = chatLevelKey;
    } else if (chatLevelKey) {
        activeKey = chatLevelKey;
        if (chatLevelKey.startsWith('chat::')) {
            fallbackKeys = [];
            const parentKey = getParentChatKey();
            if (parentKey) fallbackKeys.push(parentKey);
            const avatarKey = getAvatarKey();
            if (avatarKey) fallbackKeys.push(avatarKey);
        }
    }

    // Ensure extension settings exist
    if (!extension_settings["NPC-Bank"]) extension_settings["NPC-Bank"] = { profiles: {}, npcBank: {} };
    if (!extension_settings["NPC-Bank"].profiles) extension_settings["NPC-Bank"].profiles = {};

    // Try to load profile
    let profile = null;
    const keysToTry = [activeKey, ...fallbackKeys, "default"];

    for (const key of keysToTry) {
        if (key && extension_settings["NPC-Bank"].profiles[key]) {
            profile = extension_settings["NPC-Bank"].profiles[key];
            setLoadedProfileKey(key);
            break;
        }
    }

    // If no profile found, create default
    if (!profile) {
        profile = createDefaultProfile();
        if (activeKey) {
            extension_settings["NPC-Bank"].profiles[activeKey] = profile;
            setLoadedProfileKey(activeKey);
        }
    }

    // Ensure NPC bank structure exists
    if (!profile.npcBank) {
        profile.npcBank = { enabled: true, npcs: [], version: 1 };
    }

    // Migrate NPC bank settings to profile
    const settings = getNpcBankSettings();
    profile.npcBank.enabled = settings.enabled;

    setLocalProfile(profile);

    // Load chat_metadata NPC bank if exists
    loadChatMetadataBank(profile);
}

function createDefaultProfile() {
    return {
        npcBank: { enabled: true, npcs: [], version: 1 },
        settings: {}
    };
}

/** Load NPC bank from chat_metadata */
function loadChatMetadataBank(profile) {
    const context = getContext();
    if (!context?.chat?.metadata) return;

    const meta = context.chat.metadata;
    const extMeta = meta["NPC-Bank"];
    if (extMeta?.npcBank) {
        // Merge: chat_metadata takes precedence for current chat
        profile.npcBank = { ...profile.npcBank, ...extMeta.npcBank };
    }
}

/** Save NPC bank to chat_metadata */
export function saveNpcBankToChatMetadata(bank) {
    const context = getContext();
    if (!context?.chat) return;

    if (!context.chat.metadata) context.chat.metadata = {};
    if (!context.chat.metadata["NPC-Bank"]) context.chat.metadata["NPC-Bank"] = {};
    context.chat.metadata["NPC-Bank"].npcBank = bank;

    // Trigger metadata save
    if (typeof window.saveMetadata === "function") {
        window.saveMetadata(context.chat.id, context.chat.metadata);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// SAVE TO SETTINGS
// ────────────────────────────────────────────────────────────────────────

/** Flush current profile to settings under loaded key */
export function flushProfileSettingsToLoadedKey() {
    if (!_loadedProfileKey) return;
    if (!extension_settings["NPC-Bank"]?.profiles) return;

    // Don't save npcBank to settings (it's in chat_metadata)
    const { npcBank, ...profileSettings } = localProfile;
    extension_settings["NPC-Bank"].profiles[_loadedProfileKey] = {
        ...extension_settings["NPC-Bank"].profiles[_loadedProfileKey],
        ...profileSettings
    };
    saveSettingsDebounced();
}

/** Save profile to memory (settings + metadata) */
export function saveProfileToMemory() {
    flushProfileSettingsToLoadedKey();
    if (localProfile.npcBank) {
        saveNpcBankToChatMetadata(localProfile.npcBank);
    }
}