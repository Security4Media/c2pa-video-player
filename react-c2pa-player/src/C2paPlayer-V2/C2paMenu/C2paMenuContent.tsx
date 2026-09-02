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

import { type ReactNode, useEffect, useId, useState } from 'react';
import type {
  C2paMenuMode,
  C2paMenuSections,
  C2paMenuSectionTitleKey,
} from './menuViewModel';
import {
  AiOptOutSection,
  AlertItem,
  ClaimGeneratorSection,
  HistoryDetailView,
  HistorySection,
  InvalidState,
  LoadingState,
  MenuHeader,
  NoManifestState,
  OrganizationSection,
  SummarySection,
  WorkSection,
} from './components';

/**
 * The panel shell: the box, its header, and the list inside it.
 *
 * Extracted because the same three elements were written out five times, once
 * per render mode, which is how `role="menu"` came to be on five lists whose
 * children are not menu items. One wrapper means the semantics are stated once.
 *
 * `role="region"` rather than `dialog`. A dialog implies something modal, and
 * this is not: the control bar deliberately stays above and clickable
 * (menu-shell.css), and focus is moved into the panel but not trapped. Claiming
 * `dialog` without `aria-modal` and a focus trap would tell a screen reader
 * user something the panel does not do.
 *
 * `tabIndex={-1}` so the panel itself can take focus when it opens: it is the
 * container that gets focused, not a control inside it, because the first
 * control varies by mode and one of the modes has none at all.
 */
function MenuPanel({
  title,
  leadingAction,
  children,
}: {
  title: string;
  leadingAction?: ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();

  return (
    <div
      className="c2pa-menu-panel"
      role="region"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <MenuHeader title={title} leadingAction={leadingAction} titleId={titleId} />
      <ul className="vjs-menu-content c2pa-menu-content-list">{children}</ul>
    </div>
  );
}

interface C2paMenuContentProps {
  sectionTitles: Record<C2paMenuSectionTitleKey, string>;
  sections: C2paMenuSections | null;
  mode: C2paMenuMode;
  resetKey: string;
  isSegmentView: boolean;
  onBackToLive: () => void;
}

/**
 * Presentational menu body component. It receives already-derived menu
 * state and manages only local UI interactions such as expanding and
 * collapsing CAWG and ingredient sections.
 */
export function C2paMenuContent({
  sectionTitles,
  sections,
  mode,
  resetKey,
  isSegmentView,
  onBackToLive,
}: C2paMenuContentProps) {
  const [activeView, setActiveView] = useState<'default' | 'history'>('default');
  const [workExpanded, setWorkExpanded] = useState(false);
  const [aiOptOutExpanded, setAiOptOutExpanded] = useState(false);
  const [ingredientsExpanded, setIngredientsExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setActiveView('default');
    setWorkExpanded(false);
    setAiOptOutExpanded(false);
    setIngredientsExpanded({});
  }, [resetKey]);

  const handleToggleIngredient = (ingredientId: string) => {
    setIngredientsExpanded(current => ({
      ...current,
      [ingredientId]: !current[ingredientId],
    }));
  };

  let headerTitle = 'Content Credentials';
  let headerAction: ReactNode = null;

  if (isSegmentView) {
    headerAction = (
      <button
        className="c2pa-history-section__back-button c2pa-history-section__back-button--title"
        type="button"
        onClick={onBackToLive}
        aria-label="Back to live status"
      >
        <span className="c2pa-history-section__back-icon">‹</span>
      </button>
    );
  }

  if (mode === 'loading') {
    return (
      <MenuPanel title={headerTitle}>
        <LoadingState />
      </MenuPanel>
    );
  }

  if (mode === 'no-manifest') {
    return (
      <MenuPanel title={headerTitle}>
        <NoManifestState />
      </MenuPanel>
    );
  }

  if (!sections) {
    return (
      <MenuPanel title={headerTitle} />
    );
  }

  if (activeView === 'history' && sections.history) {
    headerTitle = sectionTitles.history;
    headerAction = (
      <button
        className="c2pa-history-section__back-button c2pa-history-section__back-button--title"
        type="button"
        onClick={() => setActiveView('default')}
        aria-label="Back to Content Credentials"
      >
        <span className="c2pa-history-section__back-icon">‹</span>
      </button>
    );

    return (
      <MenuPanel title={headerTitle} leadingAction={headerAction}>
        <HistoryDetailView
          section={sections.history}
          ingredientsExpanded={ingredientsExpanded}
          onToggleIngredient={handleToggleIngredient}
        />
      </MenuPanel>
    );
  }

  return (
    <MenuPanel title={headerTitle} leadingAction={headerAction}>
        {/* Whatever went wrong leads the menu. It used to trail the summary's
            issuer and date, which buried the one line saying something is
            wrong under provenance detail that only matters once nothing is.

            One block, not two. In 'invalid' mode the headline carries the
            message; the separate alert below is for the other case, where the
            playhead is somewhere valid but part of the timeline is not. Both
            used to render together, which said the same thing twice. */}
        {mode === 'invalid' ? (
          <InvalidState message={sections.summary.alert} />
        ) : sections.summary.alert ? (
          <AlertItem itemValue={sections.summary.alert} />
        ) : null}
        <SummarySection section={sections.summary} sectionTitles={sectionTitles} />
        {sections.claimGenerator ? (
          <ClaimGeneratorSection
            section={sections.claimGenerator}
            title={sectionTitles.claimGenerator}
          />
        ) : null}
        {sections.organization ? (
          <OrganizationSection
            section={sections.organization}
            title={sectionTitles.organization}
          />
        ) : null}
        {sections.work ? (
          <WorkSection
            section={sections.work}
            title={sectionTitles.work}
            isExpanded={workExpanded}
            onToggle={() => setWorkExpanded(current => !current)}
          />
        ) : null}
        {sections.aiOptOut ? (
          <AiOptOutSection
            section={sections.aiOptOut}
            title={sectionTitles.aiOptOut}
            isExpanded={aiOptOutExpanded}
            onToggle={() => setAiOptOutExpanded(current => !current)}
          />
        ) : null}
        {sections.history ? (
          <HistorySection
            title={sectionTitles.history}
            onOpen={() => setActiveView('history')}
          />
        ) : null}
    </MenuPanel>
  );
}
