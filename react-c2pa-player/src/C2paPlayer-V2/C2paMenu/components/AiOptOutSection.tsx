import type { AiOptOutSectionItem } from '../models';

export function AiOptOutSection({
  section,
  title,
}: {
  section: AiOptOutSectionItem;
  title: string;
}) {
  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-ai-optout-section">
        <div className="c2pa-menu-section__header">
          <span className="itemName c2pa-menu-section__title">{title}</span>
        </div>
        {section.assertions.map(assertion => (
          <div key={assertion.label} className="c2pa-ai-optout-section__assertion">
            <div className="c2pa-menu-section__row">
              <span className="itemName">Assertion:</span> {assertion.label}
            </div>
            {assertion.entries.map(entry => (
              <div key={`${assertion.label}-${entry.key}`} className="c2pa-menu-section__row">
                <span className="itemName">{entry.key}:</span> {entry.use ?? 'Unknown'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </li>
  );
}
