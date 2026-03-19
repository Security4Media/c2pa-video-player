import { Manifest } from '@contentauth/c2pa-web';
import {
    AiOptOutAssertionItem,
    AiOptOutEntryItem,
    AiOptOutSectionItem,
} from '../models';
import {
    CAWG_TRAINING_MINING_ASSERTION_LABEL,
    C2PA_TRAINING_MINING_ASSERTION_LABEL,
    ManifestTrainingMiningAssertion,
    selectCawgAssertion,
    getReferencedAssertionLabels,
} from './shared';

const TRAINING_MINING_ASSERTION_PRIORITY = [
    CAWG_TRAINING_MINING_ASSERTION_LABEL,
    C2PA_TRAINING_MINING_ASSERTION_LABEL,
] as const;

const ENTRY_LABELS: Record<string, string> = {
    'cawg.ai_training': 'AI training',
    'cawg.ai_generative_training': 'Generative AI training',
    'cawg.ai_inference': 'AI inference',
    'cawg.data_mining': 'Data mining',
    'c2pa.ai_training': 'AI training',
    'c2pa.ai_generative_training': 'Generative AI training',
    'c2pa.ai_inference': 'AI inference',
    'c2pa.data_mining': 'Data mining',
};

function normalizeUsage(use: string | null | undefined): AiOptOutEntryItem['use'] {
    if (use === 'allowed' || use === 'notAllowed' || use === 'constrained') {
        return use;
    }

    return 'constrained';
}

function buildUsageDescription(label: string, use: AiOptOutEntryItem['use']) {
    if (use === 'allowed') {
        return `This content may be used for ${label.toLowerCase()}.`;
    }

    if (use === 'notAllowed') {
        return `This content may not be used for ${label.toLowerCase()}.`;
    }

    return `This content may be used for ${label.toLowerCase()}, subject to additional constraints.`;
}

function mapTrainingMiningAssertion(
    assertion: ManifestTrainingMiningAssertion,
): AiOptOutAssertionItem | null {
    const entries = assertion.data?.entries;
    if (!entries) {
        return null;
    }

    const mappedEntries = Object.entries(entries).map(([key, value]) => {
        const use = normalizeUsage(value?.use);
        const label = ENTRY_LABELS[key] ?? key;

        return {
            key,
            label,
            use,
            description: buildUsageDescription(label, use),
        };
    });

    if (mappedEntries.length === 0) {
        return null;
    }

    return {
        label: assertion.label,
        entries: mappedEntries,
    };
}

/**
 * Select AI/training opt-out assertions only when they are explicitly
 * referenced by the manifest's `cawg.identity` assertion.
 *
 * This prevents standalone training-mining assertions from appearing in the
 * menu unless the publisher identity has actually signed over them.
 *
 * @param manifest - The manifest containing CAWG and training-mining assertions
 * @returns Structured AI opt-out section data, or null when no referenced assertions exist
 */
export function selectAiOptOutSection(manifest: Manifest): AiOptOutSectionItem | null {
    const cawgAssertion = selectCawgAssertion(manifest);
    if (!cawgAssertion) {
        return null;
    }

    const referencedAssertionLabels = new Set(getReferencedAssertionLabels(cawgAssertion));
    const prioritizedAssertion = TRAINING_MINING_ASSERTION_PRIORITY
        .filter(label => referencedAssertionLabels.has(label))
        .map((label) => manifest.assertions?.find(
            assertion => assertion.label === label
        ) as ManifestTrainingMiningAssertion | undefined)
        .find(Boolean);

    if (!prioritizedAssertion) {
        return null;
    }

    const assertion = mapTrainingMiningAssertion(prioritizedAssertion);
    if (!assertion) {
        return null;
    }

    return {
        assertion,
    };
}
