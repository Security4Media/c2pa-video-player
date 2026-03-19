import type { WorkSectionItem } from '../models';

export function WorkSection({
  section,
  title,
}: {
  section: WorkSectionItem;
  title: string;
}) {
  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-work-section">
        <div className="c2pa-menu-section__header">
          <span className="itemName c2pa-menu-section__title">{title}</span>
        </div>
        {section.organizationName ? (
          <div className="c2pa-menu-section__row">
            <span className="itemName">Organization:</span> {section.organizationName}
          </div>
        ) : null}
        {section.role ? (
          <div className="c2pa-menu-section__row">
            <span className="itemName">Role:</span> {section.role}
          </div>
        ) : null}
        {section.authors.map((author, index) => (
          <div
            key={`${author.identifier ?? author.email ?? author.name ?? 'author'}-${index}`}
            className="c2pa-work-section__author"
          >
            {author.name ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Author:</span> {author.name}
              </div>
            ) : null}
            {author.skill ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Role:</span> {author.skill}
              </div>
            ) : null}
            {author.email ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Email:</span> {author.email}
              </div>
            ) : null}
            {author.department ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Department:</span> {author.department}
              </div>
            ) : null}
            {author.identifier ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Identifier:</span> {author.identifier}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </li>
  );
}
