// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Core State Management
// ────────────────────────────────────────────────────────────────────────

import { extension_settings } from "../../../../extensions.js";

// ────────────────────────────────────────────────────────────────────────────
// LOCAL PROFILE (active profile for current chat)
// ────────────────────────────────────────────────────────────────────────

/** Active profile — mutable, synced to settings/chat_metadata */
export let localProfile = {
    npcBank: {
        enabled: true,
        npcs: [],
        version: 1
    },
    settings: {}
};

/** Key of the currently loaded profile (chat::xxx, group_xxx, avatar, default) */
export let _loadedProfileKey = null;

/** Set the active profile key */
export function setLoadedProfileKey(key) {
    _loadedProfileKey = key;
}

/** Replace localProfile entirely (used on chat switch) */
export function setLocalProfile(profile) {
    localProfile = profile;
}

/** Get the current localProfile */
export function getLocalProfile() {
    return localProfile;
}