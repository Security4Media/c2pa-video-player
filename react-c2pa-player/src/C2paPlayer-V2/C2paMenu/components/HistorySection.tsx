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

import type { HistorySectionItem, IngredientDisplayItem } from '../models';
import { ValidationBadge } from './shared';

function IngredientNode({
  ingredient,
  parentId,
  ingredientsExpanded,
  onToggleIngredient,
}: {
  ingredient: IngredientDisplayItem;
  parentId?: string;
  ingredientsExpanded: Record<string, boolean>;
  onToggleIngredient: (id: string) => void;
}) {
  const ingredientId = parentId ? `${parentId}-ingredient-${ingredient.index}` : `ingredient-${ingredient.index}`;
  const isTopLevelIngredient = parentId === undefined;
  const isExpanded = isTopLevelIngredient ? true : (ingredientsExpanded[ingredientId] || false);

  return (
    <div className="c2pa-history-section__ingredient">
        <div
          className="c2pa-history-section__ingredient-header"
          data-id={ingredientId}
          onClick={() => onToggleIngredient(ingredientId)}
        >
        <span className="itemName">Ingredient {ingredient.index}</span>
        {ingredient.ingredientCount && ingredient.ingredientCount > 0 ? (
          <span className="c2pa-history-section__ingredient-count">
            ({ingredient.ingredientCount} ingredient{ingredient.ingredientCount > 1 ? 's' : ''})
          </span>
        ) : null}
        {!isTopLevelIngredient ? (
          <span className={`c2pa-history-section__ingredient-toggle ${isExpanded ? 'expanded' : ''}`}>›</span>
        ) : null}
      </div>

      <div id={ingredientId} className={`c2pa-history-section__ingredient-panel ${isExpanded ? 'expanded' : ''}`}>
        <div className="c2pa-history-section__ingredient-panel-inner">
          <div className="c2pa-history-section__ingredient-content">
            {ingredient.title ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Title:</span> {ingredient.title}
              </div>
            ) : null}
            {ingredient.issuer ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Issued by:</span> {ingredient.issuer}
              </div>
            ) : null}
            {ingredient.claimGenerator ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">App or device:</span> {ingredient.claimGenerator}
              </div>
            ) : null}
            {ingredient.date ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Issued on:</span> {ingredient.date}
              </div>
            ) : null}
            {ingredient.validationStatus ? (
              <div className="c2pa-menu-section__row">
                <span className="itemName">Validation Status:</span>{' '}
                <ValidationBadge value={ingredient.validationStatus} />
              </div>
            ) : null}
            {Array.isArray(ingredient.ingredients) && ingredient.ingredients.length > 0 ? (
              <div className="c2pa-history-section__subingredients">
                <div className="c2pa-history-section__subingredients-header">
                  <span className="itemName">Sub-Ingredients:</span>
                </div>
                {ingredient.ingredients.map((nestedIngredient) => (
                  <IngredientNode
                    key={`${ingredientId}-${nestedIngredient.index}`}
                    ingredient={nestedIngredient}
                    parentId={ingredientId}
                    ingredientsExpanded={ingredientsExpanded}
                    onToggleIngredient={onToggleIngredient}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HistorySection({
  title,
  onOpen,
}: {
  title: string;
  onOpen: () => void;
}) {
  return (
    <li className="vjs-menu-item">
      <div className="c2pa-menu-section c2pa-history-section">
        <div className="c2pa-menu-section__header c2pa-menu-section__header--collapsible" onClick={onOpen}>
          <span className="itemName c2pa-menu-section__title">{title}</span>
          <span className="c2pa-menu-section__toggle">›</span>
        </div>
      </div>
    </li>
  );
}

export function HistoryDetailView({
  section,
  ingredientsExpanded,
  onToggleIngredient,
}: {
  section: HistorySectionItem;
  ingredientsExpanded: Record<string, boolean>;
  onToggleIngredient: (id: string) => void;
}) {
  return (
    <li className="vjs-menu-item c2pa-history-section__view-content">
      <div className="c2pa-menu-section c2pa-history-section">
        <div className="c2pa-history-section__content c2pa-history-section__content--detail">
          {section.ingredients.map((ingredient) => (
            <IngredientNode
              key={`ingredient-${ingredient.index}`}
              ingredient={ingredient}
              ingredientsExpanded={ingredientsExpanded}
              onToggleIngredient={onToggleIngredient}
            />
          ))}
        </div>
      </div>
    </li>
  );
}
