/**
 * useTuningStorage hook – persist tuning sessions and measurements to LocalStorage.
 *
 * Provides CRUD operations and JSON/CSV export for TuningSession records.
 */

import { useState, useCallback } from 'react';
import type { TuningSession, TuningMeasurement } from '../types/tuning';

const STORAGE_KEY = 'handpan_tuning_sessions';

function loadSessions(): TuningSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TuningSession[];
    // Revive Date objects from JSON strings
    return parsed.map(s => ({
      ...s,
      date: new Date(s.date),
      measurements: s.measurements.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch {
    return [];
  }
}

function saveSessions(sessions: TuningSession[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function useTuningStorage() {
  const [sessions, setSessions] = useState<TuningSession[]>(loadSessions);

  /** Persist a new measurement into the session with the given id (creates session if needed). */
  const saveMeasurement = useCallback(
    (sessionId: string, _handpan: string, measurement: TuningMeasurement) => {
      setSessions(prev => {
        const existing = prev.find(s => s.id === sessionId);
        let updated: TuningSession[];
        if (existing) {
          updated = prev.map(s =>
            s.id === sessionId
              ? { ...s, measurements: [...s.measurements, measurement] }
              : s
          );
        } else {
          const newSession: TuningSession = {
            id: sessionId,
            date: new Date(),
            measurements: [measurement],
          };
          updated = [newSession, ...prev];
        }
        saveSessions(updated);
        return updated;
      });
    },
    []
  );

  /** Delete a session by id. */
  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      saveSessions(updated);
      return updated;
    });
  }, []);

  /** Clear all stored sessions. */
  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSessions([]);
  }, []);

  /** Export all sessions as a JSON string. */
  const exportJSON = useCallback((): string => {
    return JSON.stringify(sessions, null, 2);
  }, [sessions]);

  /** Export all measurements across all sessions as a CSV string. */
  const exportCSV = useCallback((): string => {
    const header = 'session_id,date,handpan,note,timestamp,fund_freq,fund_dev,fund_conf,oct_freq,oct_dev,oct_conf,fifth_freq,fifth_dev,fifth_conf';
    const rows = sessions.flatMap(s =>
      s.measurements.map(m =>
        [
          s.id,
          s.date.toISOString(),
          m.handpan,
          m.note,
          m.timestamp.toISOString(),
          m.fundamental.frequency.toFixed(2),
          m.fundamental.deviation.toFixed(2),
          m.fundamental.confidence.toFixed(3),
          m.octave.frequency.toFixed(2),
          m.octave.deviation.toFixed(2),
          m.octave.confidence.toFixed(3),
          m.fifth.frequency.toFixed(2),
          m.fifth.deviation.toFixed(2),
          m.fifth.confidence.toFixed(3),
        ].join(',')
      )
    );
    return [header, ...rows].join('\n');
  }, [sessions]);

  return { sessions, saveMeasurement, deleteSession, clearAll, exportJSON, exportCSV };
}
