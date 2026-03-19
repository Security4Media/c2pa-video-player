import type { ReactNode } from 'react';

export function MenuTitle() {
  return (
    <li className="vjs-menu-title c2pa-react-menu-title">
      Content Credentials
    </li>
  );
}

export function LoadingState() {
  return (
    <li className="vjs-menu-item">
      <div
        className="alert-div"
        style={{ backgroundColor: 'rgba(14, 65, 148, 0.2)', borderColor: 'rgba(255, 255, 255, 0.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              border: '3px solid rgba(255, 255, 255, 0.3)',
              borderTopColor: 'rgba(125, 180, 255, 1)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <div>
            <strong>Loading Content Credentials...</strong>
            <br />
            Please wait while we fetch the manifest information.
          </div>
        </div>
      </div>
    </li>
  );
}

export function NoManifestState() {
  return (
    <li className="vjs-menu-item">
      <div
        className="alert-div"
        style={{ backgroundColor: 'rgba(14, 65, 148, 0.2)', borderColor: 'rgba(255, 255, 255, 0.3)' }}
      >
        <div>
          <strong>Warning: No Content Credentials Found</strong>
          <br />
          This video does not contain Content Credentials information.
        </div>
      </div>
    </li>
  );
}

export function InvalidState() {
  return (
    <li className="vjs-menu-item validation-padding">
      <div className="alert-div">
        <div>
          <strong>Content Credentials are Invalid</strong>
          <br />
          The content credentials for this video could not be verified
          <br />
          and may have been tampered with.
        </div>
      </div>
    </li>
  );
}

export function MenuField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: ReactNode;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <div>
        <div className="itemName">{label}</div> {value}
      </div>
    );
  }

  return (
    <div>
      <span className="itemName">{label}</span> {value}
    </div>
  );
}

export function WebsiteLink({ href }: { href: string }) {
  return (
    <a className="url" href={href} target="_blank" rel="noreferrer">
      {href}
    </a>
  );
}

export function ValidationBadge({ value }: { value: string }) {
  return <span className={`validation-${value.toLowerCase()}`}>{value}</span>;
}

export function AlertItem({ itemValue }: { itemValue: string }) {
  return (
    <li className="vjs-menu-item">
      <div className="alert-div">
        <img className="alert-icon" />
        <div>{itemValue}</div>
      </div>
    </li>
  );
}
