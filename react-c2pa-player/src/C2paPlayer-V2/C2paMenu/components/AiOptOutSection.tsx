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
      <div>
        <div className="itemName">{title}</div>
        {section.assertions.map(assertion => (
          <div key={assertion.label} style={{ marginTop: '8px' }}>
            <div>
              <span className="itemName">Assertion:</span> {assertion.label}
            </div>
            {assertion.entries.map(entry => (
              <div key={`${assertion.label}-${entry.key}`}>
                <span className="itemName">{entry.key}:</span> {entry.use ?? 'Unknown'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </li>
  );
}
