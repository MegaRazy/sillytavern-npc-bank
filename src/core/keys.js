// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Profile Keys
// ────────────────────────────────────────────────────────────────────────

import { getContext } from "../../../../extensions.js";

/** Get the character/profile key for current chat */
export function getCharacterKey() {
    const context = getContext();
    if (!context) return null;

    if (context.groupId) {
        return `group_${context.groupId}`;
    }

    if (context.chatId) {
        return `chat::${context.chatId}`;
    }

    const avatarId = getRawAvatar();
    if (avatarId) {
        return `avatar::${avatarId}`;
    }

    return "default";
}

/** Get raw avatar ID */
export function getRawAvatar() {
    const context = getContext();
    return context?.character?.avatar || context?.avatar || null;
}

/** Get avatar key */
export function getAvatarKey() {
    const avatar = getRawAvatar();
    return avatar ? `avatar::${avatar}` : null;
}

/** Get parent chat key (for branches) */
export function getParentChatKey() {
    const context = getContext();
    if (!context?.chat?.metadata) return null;
    const parentId = context.chat.metadata.parent_chat_id;
    return parentId ? `chat::${parentId}` : null;
}

/** Get profile level (chat, group, avatar, default) */
export function getProfileLevel() {
    const context = getContext();
    if (!context) return "default";
    if (context.groupId) return "group";
    if (context.chatId) return "chat";
    if (getRawAvatar()) return "avatar";
    return "default";
}

/** Active data identity for debugging */
export function meguminActiveDataIdentity() {
    return getCharacterKey() || getAvatarKey() || "default";
}