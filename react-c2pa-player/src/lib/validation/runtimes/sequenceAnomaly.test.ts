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

import { describe, expect, it } from 'vitest';
import { isSequenceAnomaly } from './dashBridgeRuntime';

describe('isSequenceAnomaly', () => {
  it('does not treat a healthy segment as an anomaly', () => {
    // The defect this exists for. The plugin declares `sequenceReason` as
    // `SequenceAnomalyReasonValue`, but on the live feed a perfectly good
    // segment arrives with `status: 'valid'`, `errorCodes: []` and
    // `sequenceReason: 'valid'`. Treating any value as an anomaly marked every
    // segment in the validation log as a failure, which made the log's own
    // failure filter useless on the stream it was written for - measured, two
    // rows out of two, both green segments flagged red.
    expect(isSequenceAnomaly('valid')).toBe(false);
  });

  it('recognises the anomalies the plugin actually declares', () => {
    expect(isSequenceAnomaly('duplicate')).toBe(true);
    expect(isSequenceAnomaly('out_of_order')).toBe(true);
    expect(isSequenceAnomaly('gap_detected')).toBe(true);
    expect(isSequenceAnomaly('sequence_number_below_minimum')).toBe(true);
  });

  it('says no when the engine reported nothing', () => {
    expect(isSequenceAnomaly(undefined)).toBe(false);
    expect(isSequenceAnomaly('')).toBe(false);
  });

  it('says no to a value it has never heard of', () => {
    // An allow-list, not a deny-list of 'valid': the field has already turned
    // out to carry something other than its declared type once, so a new
    // healthy-sounding value must not silently become a failure.
    expect(isSequenceAnomaly('ok')).toBe(false);
    expect(isSequenceAnomaly('none')).toBe(false);
    expect(isSequenceAnomaly('some_future_word')).toBe(false);
  });
});
