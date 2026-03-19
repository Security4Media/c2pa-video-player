import { useEffect, useState } from 'react';
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
  MenuTitle,
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

  if (mode === 'loading') {
    return (
      <>
        <MenuTitle />
        <LoadingState />
      </>
    );
  }

  if (mode === 'no-manifest') {
    return (
      <>
        <MenuTitle />
        <NoManifestState />
      </>
    );
  }

  if (mode === 'invalid') {
    return (
      <>
        <MenuTitle />
        <InvalidState />
      </>
    );
  }

  if (!sections) {
    return <MenuTitle />;
  }

  if (activeView === 'history' && sections.history) {
    return (
      <>
        <MenuTitle
          title={sectionTitles.history}
          leadingAction={(
            <button
              className="c2pa-history-section__back-button c2pa-history-section__back-button--title"
              type="button"
              onClick={() => setActiveView('default')}
              aria-label="Back to Content Credentials"
            >
              <span className="c2pa-history-section__back-icon">‹</span>
            </button>
          )}
        />
        <HistoryDetailView
          section={sections.history}
          ingredientsExpanded={ingredientsExpanded}
          onToggleIngredient={handleToggleIngredient}
        />
      </>
    );
  }

  return (
    <>
      <MenuTitle />
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
    </>
  );
}
