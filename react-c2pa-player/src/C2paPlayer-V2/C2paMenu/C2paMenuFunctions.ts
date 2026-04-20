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

/**
 * Facade for the C2PA menu module.
 * Video.js shell helpers are re-exported from `C2paMenuShell` and
 * React bridge lifecycle helpers are re-exported from `C2paMenuBridge`.
 */
export { initializeC2PAMenu } from './C2paMenuShell';
export {
    disposeC2PAMenu,
    setPlayerRootController,
    updateC2PAMenu,
} from './C2paMenuBridge';
