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

export type EmitterListener<T> = (value: T) => void;

/**
 * Minimal typed pub/sub shared by every adapter session and bridge runtime
 * in this module (previously each hand-rolled its own `#listeners`/
 * `subscribe`/`#emit` trio). Deliberately has no notion of a "current
 * value" - callers that need to replay the latest value to a new
 * subscriber (session classes do this so a late subscriber immediately
 * sees the current snapshot; bridge runtimes don't) do that themselves
 * right after subscribing, since only they know what "current" means for
 * their own snapshot.
 */
export class Emitter<T = void> {
  readonly #listeners = new Set<EmitterListener<T>>();

  subscribe(listener: EmitterListener<T>): () => void {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  emit(value?: T): void {
    this.#listeners.forEach((listener) => listener(value as T));
  }

  clear(): void {
    this.#listeners.clear();
  }
}
