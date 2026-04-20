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

import { type ReactNode, useEffect, useState } from 'react';
import type {
  C2paMenuMode,
  C2paMenuSections,
  C2paMenuSectionTitleKey,
} from './menuViewModel';
import {
  AiOptOutSection,
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

interface C2paMenuContentProps {
  sectionTitles: Record<C2paMenuSectionTitleKey, string>;
  sections: C2paMenuSections | null;
  mode: C2paMenuMode;
  resetKey: string;
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

  if (mode === 'loading') {
    return (
      <div className="c2pa-menu-panel">
        <MenuHeader title={headerTitle} />
        <ul className="vjs-menu-content c2pa-menu-content-list" role="menu">
          <LoadingState />
        </ul>
      </div>
    );
  }

  if (mode === 'no-manifest') {
    return (
      <div className="c2pa-menu-panel">
        <MenuHeader title={headerTitle} />
        <ul className="vjs-menu-content c2pa-menu-content-list" role="menu">
          <NoManifestState />
        </ul>
      </div>
    );
  }

  if (mode === 'invalid') {
    return (
      <div className="c2pa-menu-panel">
        <MenuHeader title={headerTitle} />
        <ul className="vjs-menu-content c2pa-menu-content-list" role="menu">
          <InvalidState />
        </ul>
      </div>
    );
  }

  if (!sections) {
    return (
      <div className="c2pa-menu-panel">
        <MenuHeader title={headerTitle} />
        <ul className="vjs-menu-content c2pa-menu-content-list" role="menu" />
      </div>
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
      <div className="c2pa-menu-panel">
        <MenuHeader title={headerTitle} leadingAction={headerAction} />
        <ul className="vjs-menu-content c2pa-menu-content-list" role="menu">
          <HistoryDetailView
            section={sections.history}
            ingredientsExpanded={ingredientsExpanded}
            onToggleIngredient={handleToggleIngredient}
          />
        </ul>
      </div>
    );
  }

  return (
    <div className="c2pa-menu-panel">
      <MenuHeader title={headerTitle} />
      <ul className="vjs-menu-content c2pa-menu-content-list" role="menu">
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
      </ul>
    </div>
  );
}
