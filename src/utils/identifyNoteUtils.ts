/**
 * Pure helper utilities for IdentifyNotePage (Step 1 of the 2-step tuning
 * workflow).  These are kept in a plain .ts file so they can be unit-tested
 * in the existing Node (non-DOM) Jest environment.
 */

/** Consecutive frames with the same pitch class required to accept a detection (~0.33s at 60fps). */
export const IDENTIFY_STABLE_FRAMES_REQUIRED = 20;

/** Milliseconds to wait for audio before showing a "no sound" error. */
export const IDENTIFY_LISTEN_TIMEOUT_MS = 8000;

/**
 * Converts a raw error message from getUserMedia / AudioContext into a
 * beginner-friendly string shown in the UI.
 */
export function getUserFriendlyError(rawError: string): string {
  const lower = rawError.toLowerCase();
  if (
    lower.includes('denied') ||
    lower.includes('permission') ||
    lower.includes('notallowederror')
  ) {
    return 'Please grant microphone permission and try again';
  }
  if (lower.includes('notfounderror') || lower.includes('no microphone')) {
    return 'No microphone detected. Please connect a microphone and try again';
  }
  return rawError;
}

/**
 * Returns true when the stability counter has reached the required threshold.
 */
export function isStableDetection(frames: number): boolean {
  return frames >= IDENTIFY_STABLE_FRAMES_REQUIRED;
}
