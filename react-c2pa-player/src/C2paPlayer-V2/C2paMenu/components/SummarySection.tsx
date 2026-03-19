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
      {section.alert ? <AlertItem itemValue={section.alert} /> : null}
    </>
  );
}
