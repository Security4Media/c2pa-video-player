import { useEffect, useState } from 'react';
import type {
  C2paMenuMode,
  C2paMenuSections,
} from './menuViewModel';
import { AiOptOutSection } from './components/AiOptOutSection';
import { ClaimGeneratorSection } from './components/ClaimGeneratorSection';
import { HistorySection } from './components/HistorySection';
import { OrganizationSection } from './components/OrganizationSection';
import { SummarySection } from './components/SummarySection';
import { InvalidState, LoadingState, MenuTitle, NoManifestState } from './components/shared';
import { WorkSection } from './components/WorkSection';

interface C2paMenuContentProps {
  sectionTitles: Record<string, string>;
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
  const [cawgIdentityExpanded, setCawgIdentityExpanded] = useState(false);
  const [ingredientsExpanded, setIngredientsExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCawgIdentityExpanded(false);
    setIngredientsExpanded({});
  }, [resetKey]);

  const handleToggleCawg = () => {
    setCawgIdentityExpanded(current => !current);
  };

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
          isExpanded={cawgIdentityExpanded}
          onToggleCawg={handleToggleCawg}
        />
      ) : null}
      {sections.work ? (
        <WorkSection
          section={sections.work}
          title={sectionTitles.work}
        />
      ) : null}
      {sections.aiOptOut ? (
        <AiOptOutSection
          section={sections.aiOptOut}
          title={sectionTitles.aiOptOut}
        />
      ) : null}
      {sections.history ? (
        <HistorySection
          section={sections.history}
          title={sectionTitles.history}
          ingredientsExpanded={ingredientsExpanded}
          onToggleIngredient={handleToggleIngredient}
        />
      ) : null}
    </>
  );
}
