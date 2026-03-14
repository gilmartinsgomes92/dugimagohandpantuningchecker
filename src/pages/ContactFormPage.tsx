import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { formatCents } from '../utils/musicUtils';

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mzdjvwnn';
const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

function noteToMidi(noteName: string): number | null {
  const match = noteName.match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (!match) return null;

  const [, pitchClass, octaveText] = match;
  const pitchIndex = NOTE_INDEX[pitchClass];
  if (pitchIndex === undefined) return null;

  const octave = Number(octaveText);
  if (!Number.isFinite(octave)) return null;

  return (octave + 1) * 12 + pitchIndex;
}

function getOrderedScaleText(noteNames: string[]): string {
  return [...noteNames]
    .filter(Boolean)
    .sort((a, b) => {
      const midiA = noteToMidi(a);
      const midiB = noteToMidi(b);

      if (midiA === null && midiB === null) return a.localeCompare(b);
      if (midiA === null) return 1;
      if (midiB === null) return -1;

      return midiA - midiB;
    })
    .join(' ');
}

const ContactFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { tuningResults, selectedScale, contactInfo } = state;

  const orderedScaleText = getOrderedScaleText(
  tuningResults
    .map((r) => r.noteName)
    .filter((noteName): noteName is string => Boolean(noteName))
);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState(() => ({
    name: contactInfo.name,
    email: contactInfo.email,
    phone: contactInfo.phone,
    message: contactInfo.message || '',
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  setSubmitError(null);
  setIsSubmitting(true);

  dispatch({ type: 'SET_CONTACT_INFO', payload: formData });

    const summaryLines = tuningResults.map((r) => {
    if (r.status === 'skipped') {
      return `${r.noteName}: Skipped`;
    }

    const fundamental = r.cents !== null ? formatCents(r.cents) : '—';
    const octave =
      r.octaveCents !== null && r.octaveCents !== undefined
        ? formatCents(r.octaveCents)
        : '—';
    const compoundFifth =
      r.compoundFifthCents !== null && r.compoundFifthCents !== undefined
        ? formatCents(r.compoundFifthCents)
        : '—';

    return `${r.noteName}: ${fundamental} | ${octave} | ${compoundFifth}`;
  });

  const payload = {
  name: formData.name,
  email: formData.email,
  phone: formData.phone || '',
  message: formData.message || '',
  tuningSummary:
    `Scale: ${orderedScaleText || 'Unknown'}\n` +
    `Values = Fundamental | Octave | Compound Fifth\n\n` +
    summaryLines.join('\n')
};

  try {
    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Submission failed');
    }

    navigate('/confirmation');

  } catch (err) {
    setSubmitError('Could not send your request. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};

  return (
    <div className="page contact-page">
      <div className="page-header">
        <h2 className="page-title">Request Professional Evaluation</h2>
        <p className="page-subtitle">Share your results with our tuning experts</p>
      </div>

      <form className="contact-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="name">Name *</label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="Your full name"
          />
        </div>
        <div className="form-field">
          <label htmlFor="email">Email *</label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="your@email.com"
          />
        </div>
        <div className="form-field">
          <label htmlFor="phone">Phone (optional)</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="+1 555 000 0000"
          />
        </div>
        <div className="form-field">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            rows={6}
            placeholder="Additional notes or questions…"
          />
        </div>

        <div className="tuning-summary-display">
  <h4>Tuning Summary (attached)</h4>
  <div className="summary-scale">{orderedScaleText || 'Scale not available'}</div>

  <div className="summary-notes">
    {tuningResults.map((r, i) => {
      const fundamental = r.cents !== null ? formatCents(r.cents) : '—';
      const octave =
        r.octaveCents !== null && r.octaveCents !== undefined
          ? formatCents(r.octaveCents)
          : '—';
      const compoundFifth =
        r.compoundFifthCents !== null && r.compoundFifthCents !== undefined
          ? formatCents(r.compoundFifthCents)
          : '—';

      return (
        <div key={i} className="summary-note-row">
          <span>{r.noteName}</span>
          <span>
            {r.status === 'skipped'
              ? 'Skipped'
              : `${fundamental} | ${octave} | ${compoundFifth}`}
          </span>
        </div>
      );
    })}
  </div>
</div>

        {submitError && <div className="error-banner">{submitError}</div>}
        
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/results')}>
            ← Back
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
           {isSubmitting ? 'Sending...' : 'Request Professional Evaluation'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ContactFormPage;
