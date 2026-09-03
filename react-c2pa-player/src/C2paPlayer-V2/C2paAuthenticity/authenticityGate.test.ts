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
import type { PlayerValidationState } from '@/validation';
import type { PlayheadVerdict } from '../C2paTimeline/playheadVerdict';
import {
  advanceAuthenticityGate,
  initialAuthenticityGateState,
  type AuthenticityGateInputs,
  type AuthenticityGateState,
} from './authenticityGate';

const COLLAPSE_MS = 5000;

const verdict = (
  state: PlayerValidationState | null,
  invalidRunStart: number | null = null,
): PlayheadVerdict => ({
  state,
  segment: state === null ? null : { startTime: 8, endTime: 12, validationState: state },
  invalidRunStart,
  reason: 'covering',
});

/** Both switches on, on demand, unless a case says otherwise. */
const inputs = (
  overrides: Partial<AuthenticityGateInputs> & Pick<AuthenticityGateInputs, 'verdict' | 'nowMs'>,
): AuthenticityGateInputs => ({
  event: 'tick',
  labelEnabled: true,
  consentPerRun: true,
  isLive: false,
  dvrDepthSeconds: null,
  alreadyPausedSeconds: 0,
  ...overrides,
});

/** Feeds a sequence of ticks and returns every decision, for asserting on shape. */
function play(
  steps: readonly (Partial<AuthenticityGateInputs> & Pick<AuthenticityGateInputs, 'verdict' | 'nowMs'>)[],
  from: AuthenticityGateState = initialAuthenticityGateState(0),
) {
  let state = from;

  return steps.map((step) => {
    const decision = advanceAuthenticityGate(state, inputs(step));
    state = decision.state;
    return decision;
  });
}

describe('what the label says', () => {
  it('says nothing until a verdict covers the playhead', () => {
    // The distinction the spec turns on: no coverage is "not checked yet" and
    // shows nothing, which on a live join is the first few seconds.
    const [decision] = play([{ verdict: verdict(null), nowMs: 0 }]);

    expect(decision.label).toBeNull();
    expect(decision.reason).toBe('no-verdict');
  });

  it('shows the grey label once something has actually looked', () => {
    const [decision] = play([{ verdict: verdict('Unknown'), nowMs: 0 }]);

    expect(decision.label).toMatchObject({
      state: 'Unknown',
      text: 'Unknown provenance',
      expanded: true,
      glowing: true,
    });
  });

  it('words each state as specified', () => {
    const texts = (['Trusted', 'Valid', 'Invalid', 'Unknown'] as const).map(
      (state) => play([{ verdict: verdict(state, state === 'Invalid' ? 8 : null), nowMs: 0 }])[0].label?.text,
    );

    expect(texts).toEqual([
      'Authenticity established',
      'Valid',
      'Invalid Authenticity',
      'Unknown provenance',
    ]);
  });

  it('collapses a reassuring label after five seconds', () => {
    const decisions = play([
      { verdict: verdict('Trusted'), nowMs: 0 },
      { verdict: verdict('Trusted'), nowMs: COLLAPSE_MS - 1 },
      { verdict: verdict('Trusted'), nowMs: COLLAPSE_MS },
    ]);

    expect(decisions[0].label?.expanded).toBe(true);
    expect(decisions[1].label?.expanded).toBe(true);
    expect(decisions[2].label?.expanded).toBe(false);
    expect(decisions[2].reason).toBe('collapsed');
  });

  it('keeps a warning expanded and pulsing indefinitely', () => {
    // A warning that shrinks itself after five seconds is one the viewer can
    // miss, which is the opposite of the point.
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0 },
      { verdict: verdict('Invalid', 8), nowMs: 60_000 },
    ]);

    expect(decisions[1].label).toMatchObject({ expanded: true, glowing: true });
  });

  it('restarts the collapse timer when the verdict changes', () => {
    const decisions = play([
      { verdict: verdict('Trusted'), nowMs: 0 },
      { verdict: verdict('Valid'), nowMs: 4000 },
      { verdict: verdict('Valid'), nowMs: 9100 },
    ]);

    expect(decisions[1].label).toMatchObject({ state: 'Valid', expanded: true });
    // 5s from the change at 4000, not from the first label at 0.
    expect(decisions[2].label?.expanded).toBe(false);
  });

  it('does not restart it when the same verdict arrives again', () => {
    // Otherwise a per-fragment stream would re-expand every few seconds and
    // never collapse at all.
    const decisions = play([
      { verdict: verdict('Trusted'), nowMs: 0 },
      { verdict: verdict('Trusted'), nowMs: 2000 },
      { verdict: verdict('Trusted'), nowMs: 5100 },
    ]);

    expect(decisions[2].label?.expanded).toBe(false);
  });

  it('holds the last verdict briefly when coverage is lost', () => {
    // After a forward seek nothing at the new position has been watched, so the
    // honest answer is "nothing". Without this the label blinks out on every
    // seek.
    const decisions = play([
      { verdict: verdict('Trusted'), nowMs: 0 },
      { verdict: verdict(null), nowMs: 500 },
      { verdict: verdict(null), nowMs: 1500 },
    ]);

    expect(decisions[1].label?.state).toBe('Trusted');
    expect(decisions[2].label).toBeNull();
  });

  it('shows nothing at all when the label is switched off', () => {
    const [decision] = play([
      { verdict: verdict('Trusted'), nowMs: 0, labelEnabled: false },
    ]);

    expect(decision.label).toBeNull();
    expect(decision.reason).toBe('label-off');
  });

  it('shows nothing for an invalid moment either, question or no question', () => {
    // `reason` reports the most salient thing, and raising a question outranks
    // the label being off, so only the label itself is asserted here.
    const [decision] = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, labelEnabled: false },
    ]);

    expect(decision.label).toBeNull();
  });

  it('still asks for consent with the label off', () => {
    // The two switches are independent, so each has to work with the other off.
    const [decision] = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, labelEnabled: false },
    ]);

    expect(decision.showConsent).toBe(true);
  });
});

describe('asking once per invalid run', () => {
  it('asks on entering an invalid stretch', () => {
    const [decision] = play([{ verdict: verdict('Invalid', 8), nowMs: 0 }]);

    expect(decision.showConsent).toBe(true);
    expect(decision.holdForConsent).toBe(true);
    expect(decision.reason).toBe('entered-invalid-run');
  });

  it('does not ask again for the rest of that stretch', () => {
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0 },
      { verdict: verdict('Invalid', 8), nowMs: 100, event: 'consent-accepted' },
      { verdict: verdict('Invalid', 8), nowMs: 200 },
      { verdict: verdict('Invalid', 8), nowMs: 4000 },
    ]);

    expect(decisions[1].showConsent).toBe(false);
    expect(decisions[2].reason).toBe('run-already-asked');
    expect(decisions[3].showConsent).toBe(false);
  });

  it('asks again for a different stretch after good content', () => {
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0 },
      { verdict: verdict('Invalid', 8), nowMs: 100, event: 'consent-accepted' },
      { verdict: verdict('Trusted'), nowMs: 200 },
      { verdict: verdict('Invalid', 40), nowMs: 300 },
    ]);

    expect(decisions[3].reason).toBe('entered-invalid-run');
    expect(decisions[3].showConsent).toBe(true);
  });

  it('asks again on re-entering the same stretch, as chosen', () => {
    // "Prompt again every time it is entered": leaving is what re-arms, and a
    // seek back into a consented stretch counts as entering it again.
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0 },
      { verdict: verdict('Invalid', 8), nowMs: 100, event: 'consent-accepted' },
      { verdict: verdict('Trusted'), nowMs: 200 },
      { verdict: verdict('Invalid', 8), nowMs: 300 },
    ]);

    expect(decisions[3].reason).toBe('entered-invalid-run');
  });

  it('does not treat a momentary lookup miss as leaving the stretch', () => {
    // The correction that matters most here. HLS keeps the previous result on a
    // lookup miss, which is frequent between fragments; reading a gap in
    // coverage as a return to good content would ask twice about one episode.
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0 },
      { verdict: verdict('Invalid', 8), nowMs: 100, event: 'consent-accepted' },
      { verdict: verdict(null), nowMs: 200 },
      { verdict: verdict('Invalid', 8), nowMs: 300 },
    ]);

    expect(decisions[3].reason).toBe('run-already-asked');
    expect(decisions[3].showConsent).toBe(false);
  });

  it('does nothing when consent is switched off', () => {
    const [decision] = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, consentPerRun: false },
    ]);

    expect(decision.showConsent).toBe(false);
    expect(decision.holdForConsent).toBe(false);
    expect(decision.reason).toBe('consent-off');
    expect(decision.label?.state).toBe('Invalid');
  });

  it('asks once for a condemned asset, whose single run has no start', () => {
    // A whole-asset failure is one run at -Infinity, so the monolithic case
    // reduces to today's ask-once behaviour with no special branch.
    const condemned: PlayheadVerdict = {
      state: 'Invalid',
      segment: null,
      invalidRunStart: Number.NEGATIVE_INFINITY,
      reason: 'whole-asset-invalid',
    };
    const decisions = play([
      { verdict: condemned, nowMs: 0 },
      { verdict: condemned, nowMs: 100, event: 'consent-accepted' },
      { verdict: condemned, nowMs: 30_000 },
    ]);

    expect(decisions[0].showConsent).toBe(true);
    expect(decisions[2].showConsent).toBe(false);
  });
});

describe('the countdown, and withdrawing the question', () => {
  const live = { isLive: true, dvrDepthSeconds: 30 };

  it('counts down from the share of the window a pause may consume', () => {
    // 0.8 of 30s is 24s, the same number decideLiveResume judges against.
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, ...live },
      { verdict: verdict('Invalid', 8), nowMs: 1000, ...live },
      { verdict: verdict('Invalid', 8), nowMs: 20_000, ...live },
    ]);

    expect(decisions[0].consentSecondsRemaining).toBe(24);
    expect(decisions[1].consentSecondsRemaining).toBe(23);
    expect(decisions[2].consentSecondsRemaining).toBe(4);
  });

  it('shortens it by time already spent paused', () => {
    // The pause clock cannot tell our pause from the viewer's, and the rejoin
    // measures from the pause. Promising the full budget would be a lie.
    const [decision] = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, ...live, alreadyPausedSeconds: 14 },
    ]);

    expect(decision.consentSecondsRemaining).toBe(10);
  });

  it('never offers less than a readable minimum', () => {
    const [decision] = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, isLive: true, dvrDepthSeconds: 3 },
    ]);

    expect(decision.consentSecondsRemaining).toBe(5);
  });

  it('has no countdown and never withdraws on demand', () => {
    // A position in a file does not expire, so there is nothing to withdraw
    // for and no honest deadline to show.
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0 },
      { verdict: verdict('Invalid', 8), nowMs: 600_000 },
    ]);

    expect(decisions[0].consentSecondsRemaining).toBeNull();
    expect(decisions[1].showConsent).toBe(true);
  });

  it('has no countdown when the retention is unknown', () => {
    // Which is every HLS live stream today, since hlsSession publishes no DVR
    // depth.
    const [decision] = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, isLive: true, dvrDepthSeconds: null },
    ]);

    expect(decision.consentSecondsRemaining).toBeNull();
  });

  it('withdraws the question when the budget runs out', () => {
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, ...live },
      { verdict: verdict('Invalid', 8), nowMs: 24_000, ...live },
    ]);

    expect(decisions[1].showConsent).toBe(false);
    expect(decisions[1].holdForConsent).toBe(false);
    expect(decisions[1].reason).toBe('consent-withdrawn');
  });

  it('never asks again about a stretch it withdrew from', () => {
    // The loop this exists to break: withdrawing resumes at the live edge, and
    // if the edge is still inside the same tampered stretch then asking again
    // would withdraw again, forever.
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, ...live },
      { verdict: verdict('Invalid', 8), nowMs: 24_000, ...live },
      { verdict: verdict('Invalid', 8), nowMs: 24_100, ...live },
      { verdict: verdict('Trusted'), nowMs: 30_000, ...live },
      { verdict: verdict('Invalid', 8), nowMs: 36_000, ...live },
    ]);

    expect(decisions[2].reason).toBe('run-withdrawn');
    expect(decisions[2].showConsent).toBe(false);
    // Even after leaving and coming back, which is the loop's shape.
    expect(decisions[4].reason).toBe('run-withdrawn');
  });

  it('still asks about a genuinely different stretch after a withdrawal', () => {
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, ...live },
      { verdict: verdict('Invalid', 8), nowMs: 24_000, ...live },
      { verdict: verdict('Trusted'), nowMs: 25_000, ...live },
      { verdict: verdict('Invalid', 100), nowMs: 26_000, ...live },
    ]);

    expect(decisions[3].reason).toBe('entered-invalid-run');
  });

  it('drops the question when the content it was about stops playing', () => {
    // A seek away while it is up. The question no longer applies.
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0 },
      { verdict: verdict('Trusted'), nowMs: 1000 },
    ]);

    expect(decisions[1].showConsent).toBe(false);
    expect(decisions[1].holdForConsent).toBe(false);
  });

  it('keeps the memory of withdrawn runs bounded', () => {
    let state = initialAuthenticityGateState(0);

    for (let run = 0; run < 50; run += 1) {
      const at = run * 100_000;
      state = advanceAuthenticityGate(
        state,
        inputs({ verdict: verdict('Invalid', run), nowMs: at, isLive: true, dvrDepthSeconds: 30 }),
      ).state;
      state = advanceAuthenticityGate(
        state,
        inputs({ verdict: verdict('Invalid', run), nowMs: at + 24_000, isLive: true, dvrDepthSeconds: 30 }),
      ).state;
      state = advanceAuthenticityGate(
        state,
        inputs({ verdict: verdict('Trusted'), nowMs: at + 25_000, isLive: true, dvrDepthSeconds: 30 }),
      ).state;
    }

    expect(state.withdrawnRunStarts.length).toBeLessThanOrEqual(32);
  });
});

describe('clicking the label', () => {
  it('opens the offending moment for a warning', () => {
    const decisions = play([
      { verdict: verdict('Invalid', 8), nowMs: 0 },
      { verdict: verdict('Invalid', 8), nowMs: 100, event: 'label-clicked' },
    ]);

    expect(decisions[1].openMenu?.segment).toMatchObject({ startTime: 8, endTime: 12 });
    expect(decisions[1].reason).toBe('label-clicked');
  });

  it('opens the general status for a reassuring label', () => {
    const decisions = play([
      { verdict: verdict('Trusted'), nowMs: 0 },
      { verdict: verdict('Trusted'), nowMs: 100, event: 'label-clicked' },
    ]);

    expect(decisions[1].openMenu).toEqual({ segment: null });
  });

  it('does nothing when there is no label to click', () => {
    const [decision] = play([{ verdict: verdict(null), nowMs: 0, event: 'label-clicked' }]);

    expect(decision.openMenu).toBeNull();
  });
});

describe('when to wake up again', () => {
  it('asks for a wake-up at the collapse moment', () => {
    const [decision] = play([{ verdict: verdict('Trusted'), nowMs: 1000 }]);

    expect(decision.nextDeadlineMs).toBe(1000 + COLLAPSE_MS);
  });

  it('wants nothing once collapsed and nothing is pending', () => {
    const decisions = play([
      { verdict: verdict('Trusted'), nowMs: 0 },
      { verdict: verdict('Trusted'), nowMs: 6000 },
    ]);

    expect(decisions[1].nextDeadlineMs).toBeNull();
  });

  it('asks for one at the consent deadline, which a warning alone would not', () => {
    // Nothing ticks while paused: timeupdate stops and neither bridge polls. So
    // the countdown and the withdrawal depend entirely on this.
    const [decision] = play([
      { verdict: verdict('Invalid', 8), nowMs: 0, isLive: true, dvrDepthSeconds: 30 },
    ]);

    expect(decision.nextDeadlineMs).toBe(24_000);
  });

  it('wants nothing for a warning with no deadline', () => {
    const [decision] = play([{ verdict: verdict('Unknown'), nowMs: 0 }]);

    expect(decision.nextDeadlineMs).toBeNull();
  });
});
