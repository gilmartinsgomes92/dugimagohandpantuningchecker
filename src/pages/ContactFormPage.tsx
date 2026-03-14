import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { formatCents } from '../utils/musicUtils';

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mzdjvwnn';

const ContactFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useAppContext();
  const { tuningResults, selectedScale, contactInfo } = state;

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState(() => {
    const message = `Scale: ${selectedScale || 'Unknown'}\n` +
      tuningResults.map(r =>
        `${r.noteName}: ${r.status === 'skipped' ? 'Skipped' : r.cents !== null ? formatCents(r.cents) : 'No data'}`
      ).join('\n');
    return {
      name: contactInfo.name,
      email: contactInfo.email,
      phone: contactInfo.phone,
      message: contactInfo.message || message,
    };
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  setSubmitError(null);
  setIsSubmitting(true);

  dispatch({ type: 'SET_CONTACT_INFO', payload: formData });

  const summaryLines = tuningResults.map((r) => {
    const value =
      r.status === 'skipped'
        ? 'Skipped'
        : r.cents !== null
          ? formatCents(r.cents)
          : 'No data';

    return `${r.noteName}: ${value}`;
  });

  const payload = {
    name: formData.name,
    email: formData.email,
    phone: formData.phone || '',
    message: formData.message || '',
    scale: selectedScale || 'Unknown',
    tuningSummary: summaryLines.join('\n')
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

    setSubmitted(true);
    setTimeout(() => navigate('/confirmation'), 1000);

  } catch (err) {
    setSubmitError('Could not send your request. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};

  if (submitted) {
    return (
      <div className="page contact-page">
        <div className="submission-success">
          <div className="success-icon">✅</div>
          <h2>Request Submitted!</h2>
          <p>We'll be in touch shortly with your professional evaluation.</p>
        </div>
      </div>
    );
  }

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
          <div className="summary-scale">{selectedScale || 'Scale not selected'}</div>
          <div className="summary-notes">
            {tuningResults.map((r, i) => (
              <div key={i} className="summary-note-row">
                <span>{r.noteName}</span>
                <span>{r.status === 'skipped' ? '—' : r.cents !== null ? formatCents(r.cents) : '—'}</span>
              </div>
            ))}
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
