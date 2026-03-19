import type { AiOptOutSectionItem } from '../models';

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
        <div className="c2pa-menu-section__header c2pa-menu-section__header--collapsible" onClick={onToggle}>
          <span className="itemName c2pa-menu-section__title">{title}</span>
          <span className={`c2pa-menu-section__toggle ${isExpanded ? 'expanded' : ''}`}>›</span>
        </div>
        <div className="c2pa-ai-optout-section__assertion" style={{ display: isExpanded ? 'flex' : 'none' }}>
          {policyParts.map((part, index) => (
            <div key={`${section.assertion.label}-${index}`} className="c2pa-menu-section__row">
              {part}
            </div>
          ))}
        </div>
      </div>
    </li>
  );
}
