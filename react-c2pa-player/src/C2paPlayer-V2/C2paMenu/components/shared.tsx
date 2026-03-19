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
      <div className="alert-div alert-div--loading">
        <div className="c2pa-loading-state">
          <div className="c2pa-loading-state__spinner" />
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
      <div className="alert-div alert-div--info">
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
