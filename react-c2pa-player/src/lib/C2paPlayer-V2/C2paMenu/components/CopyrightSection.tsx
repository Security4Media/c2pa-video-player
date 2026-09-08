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
import type { CopyrightSectionItem } from '../models';
import { SectionToggle, WebsiteLink } from './shared';

/**
 * `'Invalid'`/`'Absent'` never reach here (see selectCopyrightSection).
 * `'Unknown'` does, but only when `showUnverifiedIdentity` opted into it -
 * same wording and icon as OrganizationSection's own `'Unknown'` badge, so
 * the two surfaces agree on what an unverified claim looks like.
 */
function ValidationTag({ validationStatus }: { validationStatus: CopyrightSectionItem['validationStatus'] }) {
  if (validationStatus === 'Unknown') {
    return (
      <span
        className="c2pa-copyright-section__status"
        aria-label="Copyright information status: Unknown"
        title={`Not verified: ${UNVERIFIED_IDENTITY_CAVEAT}`}
        data-testid="c2pa-copyright-status"
        data-validation-state="Unknown"
      >
        ❔
      </span>
    );
  }

  const isTrusted = validationStatus === 'Trusted';

  return (
    <span
      className="c2pa-copyright-section__status"
      aria-label={`Copyright information status: ${validationStatus}`}
      title={
        isTrusted
          ? 'Trusted: this information is referenced by a trusted organization identity.'
          : 'Valid: this information is referenced by a verified organization identity, but its signing credentials are not fully trusted.'
      }
      data-testid="c2pa-copyright-status"
      data-validation-state={validationStatus}
    >
      {isTrusted ? '✅' : '☑️'}
    </span>
  );
}

export function CopyrightSection({
  section,
  title,
  isExpanded,
  onToggle,
}: {
  section: CopyrightSectionItem;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const { copyright } = section;

  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-copyright-section">
        <SectionToggle
          title={title}
          badge={<ValidationTag validationStatus={section.validationStatus} />}
          isExpanded={isExpanded}
          controls={panelId}
          onToggle={onToggle}
        />
        <div
          id={panelId}
          className={`c2pa-menu-section__content ${isExpanded ? 'expanded' : ''}`}
        >
          <div className="c2pa-menu-section__content-inner c2pa-copyright-section__content">
            {copyright.copyrightNotice ? (
              <div className="c2pa-menu-section__row">{copyright.copyrightNotice}</div>
            ) : copyright.copyrightHolder?.name ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Copyright holder:</span> {copyright.copyrightHolder.name}
                {/* Not a truthy check: copyrightYear is number | null, and a
                    declared year of 0 - however unlikely - is still a value,
                    not an absence. A truthy check would drop it silently. */}
                {copyright.copyrightYear !== null ? ` (${copyright.copyrightYear})` : ''}
              </div>
            ) : null}
            {copyright.creditText ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Credit:</span> {copyright.creditText}
              </div>
            ) : null}
            {copyright.publisher?.name ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Published by:</span>{' '}
                {copyright.publisher.legalName ?? copyright.publisher.name}
                {copyright.publisher.alternateName ? ` (${copyright.publisher.alternateName})` : ''}
              </div>
            ) : null}
            {copyright.publisher?.website ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Website:</span> <WebsiteLink href={copyright.publisher.website} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
