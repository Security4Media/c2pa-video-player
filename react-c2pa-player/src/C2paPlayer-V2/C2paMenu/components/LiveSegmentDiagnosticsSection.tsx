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

import type { LiveSegmentDiagnosticEntry, LiveSegmentDiagnosticsSectionItem } from '../models';

const STATUS_LABELS: Record<string, string> = {
  invalid: 'Invalid',
  replayed: 'Replayed',
  reordered: 'Reordered',
  missing: 'Missing',
  warning: 'Warning',
  unverified: 'Unverified',
};

function formatEntry(entry: LiveSegmentDiagnosticEntry): string {
  const statusLabel = STATUS_LABELS[entry.status] ?? entry.status;
  const details = [entry.sequenceReason, ...(entry.errorCodes ?? [])].filter(Boolean).join(', ');

  return `Segment ${entry.segmentNumber} (${entry.mediaType}): ${statusLabel}${details ? ` — ${details}` : ''}`;
}

export function LiveSegmentDiagnosticsSection({
  section,
  title,
  isExpanded,
  onToggle,
}: {
  section: LiveSegmentDiagnosticsSectionItem;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-live-segments-section">
        <div className="c2pa-menu-section__header c2pa-menu-section__header--collapsible" onClick={onToggle}>
          <span className="itemName c2pa-menu-section__title">{title}</span>
          <span className={`c2pa-menu-section__toggle ${isExpanded ? 'expanded' : ''}`}>›</span>
        </div>
        <div className={`c2pa-menu-section__content ${isExpanded ? 'expanded' : ''}`}>
          <div className="c2pa-menu-section__content-inner">
            {section.entries.map((entry, index) => (
              <div key={`${entry.mediaType}-${entry.segmentNumber}-${index}`} className="c2pa-menu-section__row">
                {formatEntry(entry)}
              </div>
            ))}
            {section.truncatedCount > 0 ? (
              <div className="c2pa-menu-section__row c2pa-live-segments-section__truncated">
                +{section.truncatedCount} more not shown
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
