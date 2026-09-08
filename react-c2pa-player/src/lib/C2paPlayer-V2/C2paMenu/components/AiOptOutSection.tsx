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

import { useId } from 'react';
import { UNVERIFIED_IDENTITY_CAVEAT } from '@/lib/validation/rules';
import type { AiOptOutSectionItem } from '../models';
import { SectionToggle } from './shared';

/**
 * Only reachable when `showUnverifiedIdentity` let an 'Unknown' identity
 * through (see selectAiOptOutSection) - `'Trusted'`/`'Valid'` render no badge
 * at all, unchanged from before this option existed.
 *
 * Same icon/tooltip as CopyrightSection's own 'Unknown' badge, in the same
 * header-badge slot, so a viewer scanning collapsed section titles gets the
 * same visual cue for both - a usage restriction nobody checked is at least
 * as consequential a claim as an unverified copyright line, and previously
 * showed no signal at all until the section was expanded.
 */
function UnverifiedBadge() {
  return (
    <span
      className="c2pa-ai-optout-section__status"
      aria-label="AI opt-out information status: Unknown"
      title={`Not verified: ${UNVERIFIED_IDENTITY_CAVEAT}`}
      data-testid="c2pa-ai-optout-status"
      data-validation-state="Unknown"
    >
      ❔
    </span>
  );
}

function formatLabelList(labels: string[]) {
  if (labels.length === 0) {
    return '';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function AiOptOutSection({
  section,
  title,
  isExpanded,
  onToggle,
}: {
  section: AiOptOutSectionItem;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const allowed = section.assertion.entries
    .filter(entry => entry.use === 'allowed')
    .map(entry => entry.label);
  const notAllowed = section.assertion.entries
    .filter(entry => entry.use === 'notAllowed')
    .map(entry => entry.label);
  const constrained = section.assertion.entries
    .filter(entry => entry.use === 'constrained')
    .map(entry => entry.label);

  const policyParts: string[] = [];

  if (notAllowed.length > 0) {
    policyParts.push(`This content may not be used for ${formatLabelList(notAllowed)}.`);
  }

  if (allowed.length > 0) {
    policyParts.push(`This content may be used for ${formatLabelList(allowed)}.`);
  }

  if (constrained.length > 0) {
    policyParts.push(`This content may be used for ${formatLabelList(constrained)}, subject to additional constraints.`);
  }

  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-ai-optout-section">
        <SectionToggle
          title={title}
          badge={section.validationStatus === 'Unknown' ? <UnverifiedBadge /> : null}
          isExpanded={isExpanded}
          controls={panelId}
          onToggle={onToggle}
        />
        <div
          id={panelId}
          className={`c2pa-menu-section__content ${isExpanded ? 'expanded' : ''}`}
        >
          <div className="c2pa-menu-section__content-inner c2pa-ai-optout-section__assertion">
            {/* Only reachable when `showUnverifiedIdentity` let an 'Unknown'
                identity through (see selectAiOptOutSection) - without this, a
                usage restriction nobody checked would read as flat fact. */}
            {section.validationStatus === 'Unknown' ? (
              <p className="c2pa-ai-optout-section__caveat">
                <span aria-hidden="true">❔ </span>
                {UNVERIFIED_IDENTITY_CAVEAT}
              </p>
            ) : null}
            {policyParts.map((part, index) => (
              <div key={`${section.assertion.label}-${index}`} className="c2pa-menu-section__row">
                {part}
              </div>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
