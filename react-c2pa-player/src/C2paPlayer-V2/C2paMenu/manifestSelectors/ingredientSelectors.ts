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

import { Ingredient, Manifest, ManifestStore } from '@contentauth/c2pa-web';
import { getIngredientValidationStatus } from '../../../services/c2pa_functions';
import { IngredientDisplayItem } from '../models';

/**
 * Extract detailed information from a single ingredient
 * @param {Manifest} parentManifest - The parent manifest that references this ingredient
 * @param {Ingredient} ingredientData - The ingredient data from manifest.ingredients
 * @param {ManifestStore} manifestStore - The manifest store containing all manifests
 * @param {number} index - The ingredient index (1-based)
 * @returns {IngredientDisplayItem} Ingredient details object
 */
function extractIngredientDetails(
    parentManifest: Manifest,
    ingredientData: Ingredient,
    manifestStore: ManifestStore,
    index: number,
): IngredientDisplayItem {
    const ingredient: IngredientDisplayItem = {
        index: index,
        title: `Ingredient ${index}`,
        issuer: null,
        date: null,
        claimGenerator: null,
        validationStatus: null,
    };

    const title = ingredientData.title || ingredientData.document_id || ingredientData.label;
    if (title) {
        ingredient.title = title;
    } else {
        console.warn(`[C2PA] Ingredient ${index} is missing a title/document_id/label, using default title`);
        ingredient.title = `Ingredient ${index}`;
    }

    const manifestRef = ingredientData.active_manifest;
    let ingredientManifest: Manifest | null = null;

    if (manifestRef && manifestStore && manifestStore.manifests) {
        ingredientManifest = manifestStore.manifests[manifestRef];
        console.log(`[C2PA] Found ingredient manifest for ingredient ${index}:`, ingredientManifest);
    }

    if (ingredientManifest) {
        if (ingredientManifest.signature_info?.issuer) {
            ingredient.issuer = ingredientManifest.signature_info.issuer;
        }

        if (ingredientManifest.signature_info?.time) {
            const date = new Date(ingredientManifest.signature_info.time);
            ingredient.date = new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }).format(date);
        }

        const claimGenerators = ingredientManifest.claim_generator_info;
        if (claimGenerators && claimGenerators.length > 0) {
            ingredient.claimGenerator = claimGenerators
                .map((gen) => gen.version ? `${gen.name} ${gen.version}` : gen.name)
                .join(', ');
        }

        const validationStatus = getIngredientValidationStatus(parentManifest, manifestRef as string);
        if (validationStatus) {
            ingredient.validationStatus = validationStatus;
        }

        if (manifestRef) {
            ingredient.manifestRef = manifestRef;
        }
        ingredient.manifest = ingredientManifest;
    }

    return ingredient;
}

/**
 * Select ingredients from a manifest
 * This function can be reused to extract ingredients from any manifest,
 * including nested ingredients from an ingredient's manifest
 * @param {Manifest} manifest - The manifest to extract ingredients from
 * @param {ManifestStore} manifestStore - The manifest store containing all manifests
 * @returns {Array|null} Array of ingredient objects or null if no ingredients
 */
export function selectIngredients(manifest: Manifest, manifestStore: ManifestStore) {
    
    const ingredientAssertions = manifest.ingredients;

    if (!ingredientAssertions || ingredientAssertions.length === 0) {
        console.log(`[C2PA] No ingredients found in manifest ${manifest.id}`);
        return null;
    }

    console.log(`[C2PA] Found ${ingredientAssertions.length} ingredient(s) in manifest ${manifest.id}`);

    const ingredients: IngredientDisplayItem[] = [];

    ingredientAssertions.forEach((ingredientData, index) => {
        if (!ingredientData) return;

        const ingredient = extractIngredientDetails(manifest, ingredientData, manifestStore, index + 1);

        if (ingredient.manifest) {
            const nestedIngredients = selectIngredients(ingredient.manifest as Manifest, manifestStore);
            if (nestedIngredients && nestedIngredients.length > 0) {
                ingredient.ingredients = nestedIngredients;
                ingredient.ingredientCount = nestedIngredients.length;
            }
        }

        ingredients.push(ingredient);
    });

    return ingredients.length > 0 ? ingredients : null;
}
