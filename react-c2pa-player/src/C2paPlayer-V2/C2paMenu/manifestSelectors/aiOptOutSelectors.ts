import { Manifest } from '@contentauth/c2pa-web';
import {
    AiOptOutAssertionItem,
    AiOptOutSectionItem,
} from '../models';
import {
    CAWG_TRAINING_MINING_ASSERTION_LABEL,
    C2PA_TRAINING_MINING_ASSERTION_LABEL,
    ManifestTrainingMiningAssertion,
    selectCawgAssertion,
    getReferencedAssertionLabels,
} from './shared';

const TRAINING_MINING_ASSERTION_LABELS = [
    CAWG_TRAINING_MINING_ASSERTION_LABEL,
    C2PA_TRAINING_MINING_ASSERTION_LABEL,
] as const;

function mapTrainingMiningAssertion(
    assertion: ManifestTrainingMiningAssertion,
): AiOptOutAssertionItem | null {
    const entries = assertion.data?.entries;
    if (!entries) {
        return null;
    }

    const mappedEntries = Object.entries(entries).map(([key, value]) => ({
        key,
        use: value?.use ?? null,
    }));

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
    const assertions = TRAINING_MINING_ASSERTION_LABELS
        .filter(label => referencedAssertionLabels.has(label))
        .map((label) => manifest.assertions?.find(
            assertion => assertion.label === label
        ) as ManifestTrainingMiningAssertion | undefined)
        .map(assertion => (assertion ? mapTrainingMiningAssertion(assertion) : null))
        .filter((assertion): assertion is AiOptOutAssertionItem => Boolean(assertion));

    if (assertions.length === 0) {
        return null;
    }

    return {
        assertions,
    };
}
