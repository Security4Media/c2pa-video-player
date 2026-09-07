/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Manifest, ManifestAssertion } from '@contentauth/c2pa-web';

/** Every version of this assertion seen so far starts with this prefix (`c2pa.actions`, `c2pa.actions.v2`, ...). */
const ACTIONS_ASSERTION_LABEL_PREFIX = 'c2pa.actions';

const PUBLISHED_ACTION = 'c2pa.published';

export interface ManifestActionsAssertion extends ManifestAssertion {
    label: string;
    data: {
        actions?: Array<{ action?: string | null }> | null;
    } | null;
}

/**
 * Finds the manifest's actions assertion, whatever version it declares.
 * Matched by label prefix rather than an exact `c2pa.actions`/`c2pa.actions.v2`
 * list: a future `.v3` needs no change here.
 */
export function selectActionsAssertion(manifest: Manifest): ManifestActionsAssertion | null {
    const assertion = manifest.assertions?.find(
        (candidate) => candidate.label.startsWith(ACTIONS_ASSERTION_LABEL_PREFIX)
    ) as ManifestActionsAssertion | undefined;

    return assertion?.data ? assertion : null;
}

/** Whether the manifest's actions assertion declares a `c2pa.published` action. */
export function hasPublishedAction(manifest: Manifest): boolean {
    const assertion = selectActionsAssertion(manifest);

    return assertion?.data?.actions?.some((entry) => entry.action === PUBLISHED_ACTION) ?? false;
}
