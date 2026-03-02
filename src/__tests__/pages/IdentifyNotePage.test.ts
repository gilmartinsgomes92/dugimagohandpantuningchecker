/**
 * Unit tests for IdentifyNotePage pure helper functions.
 *
 * The component itself requires a DOM / React rendering environment, but the
 * pure helper functions exported from IdentifyNotePage are tested here in the
 * existing Node test environment without any DOM setup.
 *
 * Covered areas:
 *  - getUserFriendlyError  – converts raw microphone errors to friendly messages
 *  - isStableDetection     – threshold check for note stability frame counter
 *  - IDENTIFY_STABLE_FRAMES_REQUIRED and IDENTIFY_LISTEN_TIMEOUT_MS constants
 */

import {
  getUserFriendlyError,
  isStableDetection,
  IDENTIFY_STABLE_FRAMES_REQUIRED,
  IDENTIFY_LISTEN_TIMEOUT_MS,
} from '../../utils/identifyNoteUtils';

// ── getUserFriendlyError ──────────────────────────────────────────────────────

describe('getUserFriendlyError – permission / denied errors', () => {
  it('returns permission message when error contains "denied"', () => {
    const msg = getUserFriendlyError('Permission denied');
    expect(msg).toBe('Please grant microphone permission and try again');
  });

  it('returns permission message when error contains "permission" (case-insensitive)', () => {
    const msg = getUserFriendlyError('NotAllowedError: Permission not granted');
    expect(msg).toBe('Please grant microphone permission and try again');
  });

  it('returns permission message when error contains "notallowederror"', () => {
    const msg = getUserFriendlyError('NotAllowedError');
    expect(msg).toBe('Please grant microphone permission and try again');
  });

  it('is case-insensitive for "DENIED"', () => {
    const msg = getUserFriendlyError('DENIED');
    expect(msg).toBe('Please grant microphone permission and try again');
  });
});

describe('getUserFriendlyError – no microphone errors', () => {
  it('returns no-microphone message when error contains "notfounderror"', () => {
    const msg = getUserFriendlyError('NotFoundError: device not found');
    expect(msg).toBe('No microphone detected. Please connect a microphone and try again');
  });

  it('returns no-microphone message when error contains "no microphone"', () => {
    const msg = getUserFriendlyError('No microphone available');
    expect(msg).toBe('No microphone detected. Please connect a microphone and try again');
  });
});

describe('getUserFriendlyError – unknown errors', () => {
  it('returns the raw message for unrecognized errors', () => {
    const raw = 'Something went wrong unexpectedly';
    expect(getUserFriendlyError(raw)).toBe(raw);
  });

  it('returns the raw message for an empty string', () => {
    expect(getUserFriendlyError('')).toBe('');
  });
});

// ── isStableDetection ─────────────────────────────────────────────────────────

describe('isStableDetection – stability threshold check', () => {
  it('returns false when frames is 0', () => {
    expect(isStableDetection(0)).toBe(false);
  });

  it('returns false one frame below threshold', () => {
    expect(isStableDetection(IDENTIFY_STABLE_FRAMES_REQUIRED - 1)).toBe(false);
  });

  it('returns true exactly at threshold', () => {
    expect(isStableDetection(IDENTIFY_STABLE_FRAMES_REQUIRED)).toBe(true);
  });

  it('returns true above threshold', () => {
    expect(isStableDetection(IDENTIFY_STABLE_FRAMES_REQUIRED + 10)).toBe(true);
  });
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('IdentifyNotePage constants', () => {
  it('IDENTIFY_STABLE_FRAMES_REQUIRED is 45', () => {
    expect(IDENTIFY_STABLE_FRAMES_REQUIRED).toBe(45);
  });

  it('IDENTIFY_LISTEN_TIMEOUT_MS is 5000', () => {
    expect(IDENTIFY_LISTEN_TIMEOUT_MS).toBe(5000);
  });
});
