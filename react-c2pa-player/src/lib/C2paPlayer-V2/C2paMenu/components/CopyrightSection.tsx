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
import type { CopyrightSectionItem } from '../models';
import { SectionToggle, WebsiteLink } from './shared';

/**
 * This section only ever renders when the referencing cawg.identity is
 * Trusted (see selectOrganizationIdentity/selectCopyrightSection), so the
 * badge is a fixed confirmation rather than one of several possible states.
 */
function TrustedTag() {
  return (
    <span
      className="c2pa-copyright-section__status"
      aria-label="Copyright information status: Trusted"
      title="Trusted: this information is referenced by a trusted organization identity."
      data-testid="c2pa-copyright-status"
      data-validation-state="Trusted"
    >
      ✅
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
          badge={<TrustedTag />}
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
                {copyright.copyrightYear ? ` (${copyright.copyrightYear})` : ''}
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
                {copyright.publisher.website ? (
                  <>
                    {' — '}
                    <WebsiteLink href={copyright.publisher.website} />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
