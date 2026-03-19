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
      <div>
        <div className="itemName">{title}</div>
        {section.role ? (
          <div>
            <span className="itemName">Role:</span> {section.role}
          </div>
        ) : null}
        {section.authors.map((author, index) => (
          <div key={`${author.identifier ?? author.email ?? author.name ?? 'author'}-${index}`} style={{ marginTop: '8px' }}>
            {author.name ? (
              <div>
                <span className="itemName">Author:</span> {author.name}
              </div>
            ) : null}
            {author.skill ? (
              <div>
                <span className="itemName">Role:</span> {author.skill}
              </div>
            ) : null}
            {author.email ? (
              <div>
                <span className="itemName">Email:</span> {author.email}
              </div>
            ) : null}
            {author.department ? (
              <div>
                <span className="itemName">Department:</span> {author.department}
              </div>
            ) : null}
            {author.identifier ? (
              <div>
                <span className="itemName">Identifier:</span> {author.identifier}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </li>
  );
}
