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

import { useEffect, useState, type ReactNode } from 'react';

function LoadingSpinner() {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let animationFrameId = 0;
    let lastTimestamp = 0;
    const rotationPerMillisecond = 0.36;

    const animate = (timestamp: number) => {
      if (lastTimestamp === 0) {
        lastTimestamp = timestamp;
      }

      const delta = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      setRotation(currentRotation => (currentRotation + delta * rotationPerMillisecond) % 360);
      animationFrameId = window.requestAnimationFrame(animate);
    };

    animationFrameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      className="c2pa-loading-state__spinner"
      style={{ transform: `rotate(${rotation}deg)` }}
    />
  );
}

export function MenuHeader({
  title = 'Content Credentials',
  leadingAction,
}: {
  title?: string;
  leadingAction?: ReactNode;
}) {
  return (
    <div className="c2pa-menu-header">
      {leadingAction ? (
        <span className="c2pa-menu-title__action">
          {leadingAction}
        </span>
      ) : null}
      <span className="c2pa-menu-title__text">{title}</span>
    </div>
  );
}

export function LoadingState() {
  return (
    <li className="vjs-menu-item">
      <div className="alert-div alert-div--loading">
        <div className="c2pa-loading-state">
          <LoadingSpinner />
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

/**
 * The failure headline.
 *
 * The message is passed in rather than fixed here. It used to be fixed, and
 * the view model's own sentence was then rendered *underneath* it as a second
 * alert - so a viewer got the same news twice, in two different wordings, one
 * of which enumerated segment ranges. Which failure it is decides what the
 * sentence should say (this moment, or the whole source), and only the view
 * model knows that.
 */
export function InvalidState({ message }: { message?: string | null }) {
  return (
    <li className="vjs-menu-item validation-padding" data-testid="c2pa-invalid-state">
      <div className="alert-div alert-div--failure">
        <img className="alert-icon" alt="" />
        <div>
          <strong className="alert-div__headline">Content Credentials are invalid</strong>
          <span className="alert-div__body">
            {message ?? 'The content may have been tampered with.'}
          </span>
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
  // `data-validation-state` carries the verdict itself so a test can read it
  // without depending on the label's wording or its styling.
  return (
    <span
      className={`validation-${value.toLowerCase()}`}
      data-testid="c2pa-validation-status"
      data-validation-state={value}
    >
      {value}
    </span>
  );
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
