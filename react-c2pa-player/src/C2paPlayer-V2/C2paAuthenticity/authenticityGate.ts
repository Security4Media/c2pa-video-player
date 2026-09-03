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
 * What the authenticity label says, and when to ask the viewer for consent.
 *
 * Both behaviours read the same thing - the verdict for the moment being played
 * (see playheadVerdict.ts) - so they are decided together, here, away from the
 * DOM and away from video.js. The caller translates the result into a pause, a
 * store write and a class name; every rule worth arguing about is in this file
 * and is covered by its own test.
 *
 * The two are independently switchable (`?label=on`, `?consent=per-run`),
 * because a deployment may want to tell viewers what they are watching without
 * interrupting them, or interrupt without a permanent badge on the picture. So
 * each half must work with the other off, which is why `askConsent` is computed
 * even when the label is disabled.
 *
 * Levels, not edges: `holdForConsent` and `showConsent` describe how things
 * should be right now, and are safe to apply on every tick. The caller does the
 * edge detection, which is what keeps this idempotent under a 4Hz tick and a
 * timer firing in between.
 */

import type { PlayerValidationState, ValidationTimelineSegment } from '@/validation';
import { pauseBudgetSeconds } from '../C2paTimeline/liveResume';
import type { PlayheadVerdict } from '../C2paTimeline/playheadVerdict';

/**
 * How long a reassuring label stays expanded before collapsing to its dot.
 *
 * Long enough to read three words at a glance, short enough that a permanent
 * sentence is not left sitting over the picture. Invalid and Unknown do not
 * collapse at all: a warning that shrinks itself after five seconds is a
 * warning the viewer can miss.
 */
const LABEL_EXPANDED_MS = 5000;

/**
 * How long the previous verdict is kept when coverage is lost.
 *
 * After any forward seek, and after a rejoin at the live edge, nothing at the
 * new position has been watched yet, so no segment covers the playhead and the
 * honest answer is "nothing". Without a grace the label would blink out for a
 * second and come back, on every seek. This only ever extends a verdict that
 * was true a moment earlier, and it does not weaken "show nothing before the
 * first verdict", where there is nothing to extend from.
 */
const NO_VERDICT_GRACE_MS = 1000;

/**
 * The least time the viewer gets to answer, whatever the DVR allows.
 *
 * The budget comes from the stream's own retention, and a shallow one is
 * unkind: an 8s window gives 6.4s, a 3s window 2.4s. A question that expires
 * before it can be read is worse than no question, so it is floored. The
 * consequence is honest and worth knowing: on a very shallow window the
 * position may be gone before the deadline, and the rejoin will move the viewer
 * anyway.
 */
const MIN_CONSENT_SECONDS = 5;

/**
 * How many withdrawn runs to remember.
 *
 * More runs than a retention window can hold: five minutes at two-second
 * fragments is 150 fragments, and a run is several fragments. Capped so a
 * stream running for days cannot grow this without bound.
 */
const WITHDRAWN_RUN_MEMORY = 32;

/** The words for each state. Here rather than in the component, so they are tested. */
export const LABEL_TEXT: Record<PlayerValidationState, string> = {
  Trusted: 'Authenticity established',
  Valid: 'Valid',
  Invalid: 'Invalid Authenticity',
  Unknown: 'Unknown provenance',
};

export interface AuthenticityGateState {
  /** The verdict the label is showing, or null for no label at all. */
  labelState: PlayerValidationState | null;
  /** When `labelState` was entered, for the collapse timer. */
  labelSinceMs: number;
  /** When a verdict last covered the playhead, for the grace above. */
  lastVerdictAtMs: number;
  /**
   * The invalid run already asked about, cleared when content returns to
   * something that is positively not invalid.
   *
   * This is the whole "once per run" rule. It is a run identity rather than a
   * boolean because losing coverage must not clear it: a momentary lookup miss
   * inside a bad stretch is frequent on HLS, and reading it as a return to good
   * content would ask twice about one episode of tampering.
   */
  answeredRunStart: number | null;
  /**
   * Runs whose question expired unanswered. Never asked about again.
   *
   * The narrow exception to "ask again every time the stretch is entered", and
   * it exists to break a loop rather than as a preference: withdrawing resumes
   * at the live edge, and if the live edge is still inside the same tampered
   * stretch then asking again would withdraw again, forever.
   */
  withdrawnRunStarts: readonly number[];
  /** Non-null while the question is on screen. */
  consent: {
    runStart: number;
    askedAtMs: number;
    /** null when there is no measurable budget, so it never withdraws. */
    deadlineMs: number | null;
  } | null;
}

export type AuthenticityGateEvent = 'tick' | 'consent-accepted' | 'label-clicked';

export interface AuthenticityGateInputs {
  event: AuthenticityGateEvent;
  verdict: PlayheadVerdict;
  /** `?label=on`. */
  labelEnabled: boolean;
  /** `?consent=per-run`. */
  consentPerRun: boolean;
  isLive: boolean;
  /** What the origin retains, or null when unknown. */
  dvrDepthSeconds: number | null;
  /** How long the element had already been paused when the question went up. */
  alreadyPausedSeconds: number;
  nowMs: number;
}

export interface AuthenticityLabelView {
  state: PlayerValidationState;
  text: string;
  expanded: boolean;
  /** Invalid and Unknown, which do not collapse and do not stop pulsing. */
  glowing: boolean;
}

export interface AuthenticityGateDecision {
  state: AuthenticityGateState;
  label: AuthenticityLabelView | null;
  /** Playback must be held: a question is unanswered. */
  holdForConsent: boolean;
  showConsent: boolean;
  /** Whole seconds left before the question withdraws, or null for no deadline. */
  consentSecondsRemaining: number | null;
  /**
   * The click asked to inspect; the caller opens the menu and pauses.
   *
   * Carries the segment rather than its time so the caller cannot look up a
   * different one than the label was describing.
   */
  openMenu: { segment: ValidationTimelineSegment | null } | null;
  /** When to evaluate again even if no snapshot arrives. */
  nextDeadlineMs: number | null;
  reason:
    | 'label-off'
    | 'no-verdict'
    | 'showing'
    | 'collapsed'
    | 'entered-invalid-run'
    | 'awaiting-consent'
    | 'consent-accepted'
    | 'consent-withdrawn'
    | 'run-already-asked'
    | 'run-withdrawn'
    | 'consent-off'
    | 'label-clicked';
}

export function initialAuthenticityGateState(nowMs: number): AuthenticityGateState {
  return {
    labelState: null,
    labelSinceMs: nowMs,
    lastVerdictAtMs: Number.NEGATIVE_INFINITY,
    answeredRunStart: null,
    withdrawnRunStarts: [],
    consent: null,
  };
}

/** Never collapses, always pulses. */
const isWarning = (state: PlayerValidationState) =>
  state === 'Invalid' || state === 'Unknown';

function remember(runs: readonly number[], runStart: number): readonly number[] {
  if (runs.includes(runStart)) {
    return runs;
  }

  return [runStart, ...runs].slice(0, WITHDRAWN_RUN_MEMORY);
}

function consentDeadline(inputs: AuthenticityGateInputs): number | null {
  if (!inputs.isLive) {
    // A position in a file does not expire, so there is nothing to withdraw
    // for and no honest countdown to show.
    return null;
  }

  const budget = pauseBudgetSeconds(inputs.dvrDepthSeconds);

  if (budget === null) {
    return null;
  }

  // Subtracting what has already been spent, because the pause clock cannot
  // tell our pause from the viewer's. If they paused two minutes ago and a
  // verdict raises the question now, a countdown promising the full budget
  // would be a lie: the rejoin measures from the pause, not from the question.
  const already = Number.isFinite(inputs.alreadyPausedSeconds)
    ? Math.max(0, inputs.alreadyPausedSeconds)
    : 0;
  const seconds = Math.max(MIN_CONSENT_SECONDS, budget - already);

  return inputs.nowMs + seconds * 1000;
}

export function advanceAuthenticityGate(
  previous: AuthenticityGateState,
  inputs: AuthenticityGateInputs,
): AuthenticityGateDecision {
  const { event, verdict, labelEnabled, consentPerRun, nowMs } = inputs;
  let state: AuthenticityGateState = { ...previous };

  // --- the label ---------------------------------------------------------

  if (verdict.state !== null) {
    state.lastVerdictAtMs = nowMs;
  }

  const withinGrace = nowMs - state.lastVerdictAtMs < NO_VERDICT_GRACE_MS;
  const effective =
    verdict.state ?? (withinGrace ? state.labelState : null);

  if (effective !== state.labelState) {
    state.labelState = effective;
    state.labelSinceMs = nowMs;
  }

  let label: AuthenticityLabelView | null = null;

  if (labelEnabled && state.labelState !== null) {
    const warning = isWarning(state.labelState);

    label = {
      state: state.labelState,
      text: LABEL_TEXT[state.labelState],
      expanded: warning || nowMs - state.labelSinceMs < LABEL_EXPANDED_MS,
      glowing: warning,
    };
  }

  // --- the question ------------------------------------------------------

  let reason: AuthenticityGateDecision['reason'] = label
    ? label.expanded
      ? 'showing'
      : 'collapsed'
    : labelEnabled
      ? 'no-verdict'
      : 'label-off';

  if (event === 'consent-accepted') {
    // The run stays recorded, so the rest of this stretch plays without asking
    // again. Leaving it re-arms.
    state.consent = null;
    reason = 'consent-accepted';
  }

  const runStart = verdict.invalidRunStart;

  if (verdict.state === 'Invalid' && runStart !== null) {
    if (!consentPerRun) {
      reason = 'consent-off';
    } else if (state.withdrawnRunStarts.includes(runStart)) {
      reason = 'run-withdrawn';
    } else if (state.consent !== null && state.consent.runStart === runStart) {
      // Already up for this run. Withdraw if the budget has run out.
      if (state.consent.deadlineMs !== null && nowMs >= state.consent.deadlineMs) {
        state.withdrawnRunStarts = remember(state.withdrawnRunStarts, runStart);
        state.consent = null;
        reason = 'consent-withdrawn';
      } else {
        reason = 'awaiting-consent';
      }
    } else if (state.answeredRunStart === runStart) {
      reason = 'run-already-asked';
    } else if (event !== 'consent-accepted') {
      state.answeredRunStart = runStart;
      state.consent = {
        runStart,
        askedAtMs: nowMs,
        deadlineMs: consentDeadline(inputs),
      };
      reason = 'entered-invalid-run';
    }
  } else if (verdict.state !== null) {
    // A verdict that is positively not invalid re-arms the gate. `null` does
    // not: see AuthenticityGateState.answeredRunStart.
    state.answeredRunStart = null;

    if (state.consent !== null) {
      // The content the question was about is no longer playing, so the
      // question no longer applies.
      state.consent = null;
    }
  }

  // --- the click ---------------------------------------------------------

  let openMenu: AuthenticityGateDecision['openMenu'] = null;

  if (event === 'label-clicked' && label) {
    // A warning opens on the offending moment, where the detail is; a
    // reassuring label opens the general status, which is what it is about.
    openMenu = {
      segment: isWarning(label.state) ? verdict.segment : null,
    };
    reason = 'label-clicked';
  }

  // --- what to wake up for ----------------------------------------------

  const collapseAt =
    label && label.expanded && !label.glowing
      ? state.labelSinceMs + LABEL_EXPANDED_MS
      : null;
  const deadlines = [collapseAt, state.consent?.deadlineMs ?? null].filter(
    (value): value is number => value !== null,
  );

  return {
    state,
    label,
    holdForConsent: state.consent !== null,
    showConsent: state.consent !== null,
    consentSecondsRemaining:
      state.consent?.deadlineMs == null
        ? null
        : Math.max(0, Math.ceil((state.consent.deadlineMs - nowMs) / 1000)),
    openMenu,
    nextDeadlineMs: deadlines.length > 0 ? Math.min(...deadlines) : null,
    reason,
  };
}
