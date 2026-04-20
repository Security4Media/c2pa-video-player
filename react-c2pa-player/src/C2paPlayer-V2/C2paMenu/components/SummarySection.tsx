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

import type { SummarySectionItem } from '../menuViewModel';
import { AlertItem, MenuField, ValidationBadge } from './shared';

export function SummarySection({
  section,
  sectionTitles,
}: {
  section: SummarySectionItem;
  sectionTitles: Record<string, string>;
}) {
  return (
    <>
      {section.validationStatus ? (
        <li className="vjs-menu-item">
          <div className="c2pa-summary-section__value">
            <MenuField
              label={sectionTitles.validationStatus}
              value={<ValidationBadge value={section.validationStatus} />}
            />
          </div>
        </li>
      ) : null}
      {section.issuer ? (
        <li className="vjs-menu-item">
          <div className="c2pa-summary-section__value">
            <MenuField label={sectionTitles.summaryIssuer} value={section.issuer} />
          </div>
        </li>
      ) : null}
      {section.issuedOn ? (
        <li className="vjs-menu-item">
          <div className="c2pa-summary-section__value">
            <MenuField label={sectionTitles.summaryDate} value={section.issuedOn} />
          </div>
        </li>
      ) : null}

      {section.alert ? <AlertItem itemValue={section.alert} /> : null}
    </>
  );
}
