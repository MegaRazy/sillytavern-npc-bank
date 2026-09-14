// ────────────────────────────────────────────────────────────────────────────
// NPC Bank — Field Definitions
// ────────────────────────────────────────────────────────────────────────

// ── Field Types ─────────────────────────────────────────────────────────────
export const NPC_FIELD_TYPES = [
    { v: "text", label: "Text", hint: "a single line" },
    { v: "longtext", label: "Paragraph", hint: "a few sentences of prose" },
    { v: "list", label: "List", hint: "bulleted entries, one per line" }
];

// ── System Roles (never delete, only relabel/reorder) ───────────────────────
export const NPC_SYSTEM_ROLES = ["name", "vitals", "imageTags"];

// ── Default Field Definitions ───────────────────────────────────────────────
export const NPC_DEFAULT_FIELDS = [
    {
        id: "name",
        label: "Name",
        type: "text",
        role: "name",
        fixed: true,
        persistent: true,
        updatable: false,
        system: true,
        ownLine: false
    },
    {
        id: "vitals",
        label: "Vitals",
        type: "text",
        role: "vitals",
        fixed: true,
        persistent: true,
        updatable: true,
        system: true,
        ownLine: false,
        subFields: [
            { id: "age", label: "Age", type: "text" },
            { id: "sex", label: "Sex", type: "text" },
            { id: "orientation", label: "Orientation", type: "text" }
        ]
    },
    {
        id: "imageTags",
        label: "Image Tags",
        type: "text",
        role: "imageTags",
        fixed: true,
        persistent: true,
        updatable: true,
        system: true,
        ownLine: false,
        hidden: true
    },
    {
        id: "archetype",
        label: "Archetype",
        type: "text",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: false
    },
    {
        id: "occupation",
        label: "Occupation",
        type: "text",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: false
    },
    {
        id: "appearance",
        label: "Appearance",
        type: "longtext",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "personality",
        label: "Personality",
        type: "longtext",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "voice",
        label: "Voice & Mannerisms",
        type: "longtext",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "background",
        label: "Background",
        type: "longtext",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "goals",
        label: "Goals & Motivations",
        type: "list",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "secrets",
        label: "Secrets",
        type: "list",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "innerCircle",
        label: "Inner Circle",
        type: "list",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "relationships",
        label: "Relationships",
        type: "list",
        persistent: false,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "knowledge",
        label: "Knowledge & Skills",
        type: "list",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "inventory",
        label: "Inventory",
        type: "list",
        persistent: false,
        updatable: true,
        fixed: false,
        ownLine: true
    },
    {
        id: "location",
        label: "Where to Find Them",
        type: "text",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: false
    },
    {
        id: "schedule",
        label: "Routine / Schedule",
        type: "list",
        persistent: true,
        updatable: true,
        fixed: false,
        ownLine: true
    }
];

// ── Derived Field Lists ─────────────────────────────────────────────────────

/** All fields (system + user) in display order */
export function npcFields() {
    return NPC_DEFAULT_FIELDS;
}

/** Field by system role */
export function npcFieldByRole(role) {
    return NPC_DEFAULT_FIELDS.find(f => f.role === role);
}

/** Fields shown in the dossier body (excludes system fields) */
export function npcBodyFields() {
    return NPC_DEFAULT_FIELDS.filter(f => !f.system);
}

/** Vitals sub-fields */
export function npcVitalsFields() {
    const vitals = npcFieldByRole("vitals");
    return vitals?.subFields || [];
}

/** Fields that can be updated via <NPC_Update> */
export function npcUpdatableFields() {
    return NPC_DEFAULT_FIELDS.filter(f => f.updatable && !f.system);
}

/** Fields that are locked (written once, never changed) */
export function npcLockedFields() {
    return NPC_DEFAULT_FIELDS.filter(f => f.persistent && !f.updatable);
}

/** Fields that hold a single value (use ~ only) */
export function npcSingleValueFields() {
    return npcUpdatableFields().filter(f => f.type !== "list");
}

/** Fields that hold a list (use +, -, ~) */
export function npcMultiValueFields() {
    return npcUpdatableFields().filter(f => f.type === "list");
}

/** Generate the persistence rule text for the prompt */
export function npcBuildPersistenceRule() {
    const single = npcSingleValueFields();
    const multi = npcMultiValueFields();
    const locked = npcLockedFields();
    const updatable = npcUpdatableFields();

    const lines = [
        "persistence_rule: >",
        "  Persistent fields describe the NPC's ongoing life (\"ordinary Tuesday\"),",
        "  not the current scene. Scene-specific fields reflect the moment only.",
        "",
        `  updatable_fields: ${updatable.map(f => f.label).join(", ")}`,
        "",
        "  operations:",
        "    ~  replaces the field's whole contents.",
        "    +  adds one new entry to a field that holds a list.",
        "    -  removes one existing entry from a field that holds a list."
    ];

    const verb = list => (list.length === 1 ? "holds" : "hold");
    if (single.length) {
        lines.push("", `    ${single.map(f => f.label).join(", ")} ${verb(single)} a single value: use ~ only.`);
    }
    if (multi.length) {
        lines.push(`    ${multi.map(f => f.label).join(", ")} ${verb(multi)} a list: use +, - or ~.`);
    }
    if (locked.length) {
        lines.push("", "  locked_fields: >", `    Never touch ${locked.map(f => f.label).join(", ")}. Those are written once and fixed.`);
    }

    return lines.join("\n");
}

/** Generate the dossier template text (injected at {{template}} in prompts) */
export function npcBuildDossierTemplate() {
    const lines = [];
    const nameField = npcFieldByRole("name");
    const vitalsField = npcFieldByRole("vitals");

    const headerParts = [];
    if (nameField) headerParts.push(`**${nameField.label}:** {{${nameField.id}}}`);
    npcVitalsFields().forEach(f => headerParts.push(`**${f.label}:** {{${f.id}}}`));
    if (headerParts.length) lines.push(headerParts.join(" | "));

    npcBodyFields().forEach(f => {
        if (f.system === "imageTags") return;
        const placeholder = `{{${f.id}}}`;
        lines.push(f.ownLine ? `**${f.label}:**\n${placeholder}` : `**${f.label}:** ${placeholder}`);
    });

    return lines.join("\n");
}

/** Build update prompt data */
export function npcBuildUpdatePrompt() {
    const updatable = npcUpdatableFields();
    const locked = npcLockedFields();

    let prompt = "Updatable fields:\n";
    updatable.forEach(f => {
        prompt += `  ${f.label} (${f.type}): `;
        if (f.type === "list") prompt += "use +, -, or ~";
        else prompt += "use ~";
        prompt += "\n";
    });
    prompt += "\nLocked fields (never touch):\n";
    locked.forEach(f => { prompt += `  ${f.label}\n`; });
    prompt += "\nOperations:\n  ~ replaces\n  + adds to list\n  - removes from list";
    return prompt;
}