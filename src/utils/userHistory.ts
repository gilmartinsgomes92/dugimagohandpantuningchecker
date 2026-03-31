import type { User } from '@supabase/supabase-js';
import { HANDPAN_SCALE_LIBRARY } from '../data/handpanScales';
import type { CertificationNoteAggregate } from '../types/certification';
import { supabase } from '../lib/supabase';
import { orderCertificationAggregates } from './certificationOrder';
import { createCertificationReportRecord } from './reportRegistry';
import type { CertificationReportStats, CertificationVerdict } from './certificationReportUtils';

export type InstrumentRecord = {
  id: string;
  user_id: string;
  name: string;
  scale_label: string | null;
  created_at: string;
  updated_at: string;
};

export type CertifiedReportHistoryRecord = {
  id: string;
  user_id: string;
  instrument_id: string;
  verification_id: string;
  report_created_at: string;
  detected_scale: string | null;
  health_score: number | null;
  note_count: number | null;
  report_json: unknown;
  created_at: string;
};

const TO_PREFERRED_PITCH_CLASS: Record<string, string> = {
  C: 'C',
  'B#': 'C',
  Db: 'Db',
  'C#': 'Db',
  D: 'D',
  Eb: 'Eb',
  'D#': 'Eb',
  E: 'E',
  Fb: 'E',
  F: 'F',
  'E#': 'F',
  'F#': 'F#',
  Gb: 'F#',
  G: 'G',
  Ab: 'Ab',
  'G#': 'Ab',
  A: 'A',
  Bb: 'Bb',
  'A#': 'Bb',
  B: 'B',
  Cb: 'B',
};

function canonicalPitchClass(pc: string): string {
  return TO_PREFERRED_PITCH_CLASS[pc] ?? pc;
}

function pitchClassOf(fullName: string): string {
  return canonicalPitchClass(fullName.replace(/\d+$/, ''));
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function scoreScale(
  detectedPitchClasses: Set<string>,
  scalePitchClassesRaw: string[],
  preferredRootPitchClass: string | null,
  scaleRootPitchClass: string,
): { score: number; overlap: number; total: number } {
  const scalePitchClasses = scalePitchClassesRaw.map(canonicalPitchClass);
  const scaleSet = new Set(scalePitchClasses);

  let overlap = 0;
  for (const pc of detectedPitchClasses) {
    if (scaleSet.has(pc)) overlap += 1;
  }

  const total = scaleSet.size;
  const missing = scalePitchClasses.filter((pc) => !detectedPitchClasses.has(pc));
  const extras = Array.from(detectedPitchClasses).filter((pc) => !scaleSet.has(pc));

  const coverage = total === 0 ? 0 : overlap / total;
  const containment = detectedPitchClasses.size === 0 ? 0 : overlap / detectedPitchClasses.size;
  const rootBonus = preferredRootPitchClass && preferredRootPitchClass === scaleRootPitchClass ? 0.18 : 0;
  const exactBonus = missing.length === 0 ? 0.04 : 0;
  const extrasPenalty = Math.min(0.28, extras.length * 0.05);

  const score = Math.max(0, coverage * 0.72 + containment * 0.24 + rootBonus + exactBonus - extrasPenalty);
  return { score, overlap, total };
}

export function getSuggestedInstrumentScale(aggregates: CertificationNoteAggregate[]): string | null {
  const ordered = orderCertificationAggregates(aggregates).filter((aggregate) => aggregate.strikeCount > 0);
  if (ordered.length === 0) return null;

  const detectedPitchClasses = new Set(ordered.map((aggregate) => pitchClassOf(aggregate.noteName)));
  const preferredRootPitchClass = pitchClassOf(ordered[0].noteName);

  const matches = HANDPAN_SCALE_LIBRARY.map((scale) => {
    const scalePitchClasses = uniq(scale.notes.map(pitchClassOf));
    const scaleRootPitchClass = pitchClassOf(scale.notes[0]);
    const scored = scoreScale(detectedPitchClasses, scalePitchClasses, preferredRootPitchClass, scaleRootPitchClass);
    return {
      sceneName: scale.sceneName,
      scaleRootPitchClass,
      ...scored,
    };
  }).sort((a, b) => b.score - a.score || b.overlap - a.overlap || a.total - b.total);

  const best = matches[0];
  if (!best || best.overlap < Math.min(4, detectedPitchClasses.size)) return null;
  return `${best.scaleRootPitchClass} ${best.sceneName}`;
}

export async function ensureUserProfile(user: User): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
      },
      { onConflict: 'id' },
    );

  if (error) {
    throw error;
  }
}

async function getOrCreateInstrument(user: User, suggestedName: string, scaleLabel: string | null): Promise<InstrumentRecord> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('instruments')
    .select('*')
    .eq('user_id', user.id)
    .eq('name', suggestedName)
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (existing) {
    return existing as InstrumentRecord;
  }

  const { data: created, error: createError } = await supabase
    .from('instruments')
    .insert({
      user_id: user.id,
      name: suggestedName,
      scale_label: scaleLabel,
    })
    .select('*')
    .single();

  if (createError) {
    throw createError;
  }

  return created as InstrumentRecord;
}

export async function saveCertifiedReportToHistory(params: {
  user: User;
  verificationId: string;
  aggregates: CertificationNoteAggregate[];
  stats: CertificationReportStats;
  verdict: CertificationVerdict;
  finalizedAt: string;
}): Promise<{ ok: boolean; error?: string; instrumentName?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  try {
    await ensureUserProfile(params.user);

    const scaleLabel = getSuggestedInstrumentScale(params.aggregates);
    const fallbackName = orderCertificationAggregates(params.aggregates)
      .filter((aggregate) => aggregate.strikeCount > 0)
      .map((aggregate) => aggregate.noteName)
      .join(' ');
    const instrumentName = scaleLabel || fallbackName || 'My Handpan';

    const instrument = await getOrCreateInstrument(params.user, instrumentName, scaleLabel);

    const reportRecord = createCertificationReportRecord({
      verificationId: params.verificationId,
      aggregates: params.aggregates,
      stats: params.stats,
      verdict: params.verdict,
      createdAt: params.finalizedAt,
    });

    const { error } = await supabase.from('certified_reports').upsert(
      {
        user_id: params.user.id,
        instrument_id: instrument.id,
        verification_id: params.verificationId,
        report_created_at: params.finalizedAt,
        detected_scale: scaleLabel,
        health_score: params.stats.healthScore,
        note_count: params.aggregates.filter((aggregate) => aggregate.strikeCount > 0).length,
        report_json: reportRecord,
      },
      { onConflict: 'verification_id' },
    );

    if (error) {
      throw error;
    }

    return { ok: true, instrumentName };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save certified report history.';
    return { ok: false, error: message };
  }
}

export async function listInstrumentHistory(user: User): Promise<{
  ok: boolean;
  instruments?: Array<InstrumentRecord & { reports: CertifiedReportHistoryRecord[] }>;
  error?: string;
}> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  try {
    await ensureUserProfile(user);

    const { data: instruments, error: instrumentsError } = await supabase
      .from('instruments')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (instrumentsError) throw instrumentsError;

    const { data: reports, error: reportsError } = await supabase
      .from('certified_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('report_created_at', { ascending: false });

    if (reportsError) throw reportsError;

    const grouped = (instruments ?? []).map((instrument) => ({
      ...(instrument as InstrumentRecord),
      reports: (reports ?? []).filter((report) => report.instrument_id === instrument.id) as CertifiedReportHistoryRecord[],
    }));

    return { ok: true, instruments: grouped };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load report history.';
    return { ok: false, error: message };
  }
}
