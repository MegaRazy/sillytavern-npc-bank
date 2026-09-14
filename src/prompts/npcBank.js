// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — System Prompts
// ────────────────────────────────────────────────────────────────────────

import { npcBuildDossierTemplate, npcBuildPersistenceRule } from "../features/npc/fields.js";

// ────────────────────────────────────────────────────────────────────────────
// DOSSIER GENERATION PROMPT
// ────────────────────────────────────────────────────────────────────────

export const npcDossierPrompt = {
    systemPrompt: `You are a narrative engine running a living world simulation. Your job is to extract NPC dossiers from the story as it unfolds.

CRITICAL RULE: Generate a dossier EXACTLY ONCE per NPC when ALL THREE conditions are met in a single scene:
  1. NAMED — given a proper name or a name the PC will use again.
  2. VOICED — speaks more than a transactional line (not "That'll be 5 credits").
  3. STAKED — has a want, opinion, or role that can affect the story later.

DO NOT generate for: cashiers, bartenders, guards, crowds, one-line faces, or anyone whose only function is set dressing.
NEVER regenerate for an NPC who already has a dossier. Treat the original dossier as locked canon.`,

    userPrompt: `The story just advanced. Scan the latest scene for NPCs meeting the three conditions above.

For each qualifying NPC, output ONE <New_NPC> block inside the <Blocks> section. Use the template below. Dense, dashboard-style. No prose paragraphs except Background and Secrets. Everything else is fragments.

{{template}}

{{persistenceRule}}

inner_circle_rule: >
  Include 2–5 people. At least one must be off-screen and unknown to the story (a mother, an ex, a childhood friend, a rival). These are future plot seeds, not just flavor.
secrets_rule: >
  Secrets are for YOU as the narrative engine. They drive behavior the PC can't predict. Never reveal in narration unless the NPC actually discloses them through action or dialogue. Higher tiers stay buried longer.
canon_lock_rule: >
  Once written, these facts are fixed. Future scenes must stay consistent with them. If a later scene needs a contradiction, surface it as a revelation (the earlier info was a lie/misunderstanding), never a silent retcon.
image_tags: 12-20 comma-separated Booru tags. PHYSICAL ONLY. NO clothes/accessories/weapons/bg/pose/expression. MUST read as adult. Order: anchor(1girl/1boy/1other) -> hair(len,style,col) -> eyes(col,shape) -> skin tone -> body(type,build) -> age-app -> marks(scars,freckles,moles,tattoos,birthmarks).`,

    template: npcBuildDossierTemplate(),
    persistenceRule: npcBuildPersistenceRule()
};

// ────────────────────────────────────────────────────────────────────────────
// NPC UPDATE PROMPT
// ────────────────────────────────────────────────────────────────────────

export const npcUpdatePrompt = {
    systemPrompt: `You are maintaining the NPC Bank — a living dossier of every named, voiced, staked character in the story.

When the scene reveals new information about an EXISTING NPC, output ONE <NPC_Update> block per NPC. Only include fields that actually changed. Never restate unchanged information.`,

    userPrompt: `The story just advanced. Check if any existing NPC's dossier needs updating based on new revelations.

Current NPC Bank:
{{npc_list}}

Updatable fields: {{updatable_fields}}

Operations:
  ~  replaces the field's whole contents
  +  adds one new entry to a list field
  -  removes one existing entry from a list field

Locked fields (NEVER touch): {{locked_fields}}

Format:
<NPC_Update name="Exact NPC Name">
  ~Field Label: New value
  +Field Label: New list entry
  -Field Label: Entry to remove
</NPC_Update>

Output ONLY the update blocks. If no updates needed, output nothing.`
};

// ────────────────────────────────────────────────────────────────────────────
// PORTRAIT GENERATION PROMPT
// ────────────────────────────────────────────────────────────────────────

export const npcPortraitPrompt = {
    systemPrompt: "You are an expert AI image prompt engineer specializing in character portraits. Your job is to read a character's dossier and convert their visual description into a highly detailed image generation prompt for a portrait. You must adhere to the requested Style Constraint and Camera Perspective. Do not include quotes, conversational text, or explanations. Output ONLY the raw prompt text.",

    userPrompt: `Write a character portrait image generation prompt based on this NPC's dossier:

<npc_dossier>
{{npcText}}
</npc_dossier>

Style Constraint: {{styleStr}}
Camera Perspective: {{perspStr}}
Extra Details: {{extraStr}}

Use the character's appearance, age, sex, occupation, and personality to inform the visual. Output ONLY the raw image prompt text.`,

    thinkingPrompt: `<thinking_steps>
Before creating the response, think deeply.

Thoughts must be wrapped in . The first token must be . The main response must immediately follow .


Reflect in approximately 50-100 words on what this character looks like and what visual elements best capture them.

</thinking_steps>

[OUTPUT ORDER]
Every response must follow this exact structure in this exact order:


{Thinking}{Main response}`
};

// ────────────────────────────────────────────────────────────────────────────
// EXPORT ALL PROMPTS
// ────────────────────────────────────────────────────────────────────────

export const NPC_BANK_PROMPTS = {
    dossier: npcDossierPrompt,
    update: npcUpdatePrompt,
    portrait: npcPortraitPrompt
};