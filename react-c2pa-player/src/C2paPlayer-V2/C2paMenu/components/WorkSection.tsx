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

import type { WorkSectionItem } from '../models';

function normalizeSentenceValue(value: string | null | undefined) {
  return value?.toLowerCase().trim() ?? '';
}

function capitalizeFirstLetter(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildAuthorCreditText(author: WorkSectionItem['authors'][number], organizationName: string | null) {
  const name = author.name ? capitalizeFirstLetter(author.name) : 'This contributor';
  const creditParts: string[] = [];
  const skill = normalizeSentenceValue(author.skill);
  const department = normalizeSentenceValue(author.department);
  const organization = normalizeSentenceValue(organizationName);

  if (skill) {
    creditParts.push(`as ${skill}`);
  }

  if (department) {
    creditParts.push(`in ${department}`);
  }

  if (organization) {
    creditParts.push(`at ${organization}`);
  }

  const creditSentence = creditParts.length > 0
    ? `${name} is credited ${creditParts.join(' ')}.`
    : `${name} is credited.`;

  if (author.email) {
    return `${creditSentence} Contact: ${author.email}.`;
  }

  return creditSentence;
}

export function WorkSection({
  section,
  title,
  isExpanded,
  onToggle,
}: {
  section: WorkSectionItem;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-work-section">
        <div className="c2pa-menu-section__header c2pa-menu-section__header--collapsible" onClick={onToggle}>
          <span className="itemName c2pa-menu-section__title">{title}</span>
          <span className={`c2pa-menu-section__toggle ${isExpanded ? 'expanded' : ''}`}>›</span>
        </div>
        <div className={`c2pa-menu-section__content ${isExpanded ? 'expanded' : ''}`}>
          <div className="c2pa-menu-section__content-inner c2pa-work-section__content">
            {section.authors.map((author, index) => (
              <div
                key={`${author.identifier ?? author.email ?? author.name ?? 'author'}-${index}`}
                className="c2pa-work-section__author"
              >
                <div className="c2pa-menu-section__row">
                  {buildAuthorCreditText(author, section.organizationName)}
                </div>
                {author.identifier ? (
                  <div className="c2pa-menu-section__row">
                    <span className="itemName">Identifier:</span> {author.identifier}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}
