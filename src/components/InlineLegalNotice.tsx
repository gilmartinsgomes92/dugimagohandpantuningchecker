import React from 'react';
import { Link } from 'react-router-dom';

type InlineLegalNoticeVariant = 'contact' | 'certification' | 'verification';

interface InlineLegalNoticeProps {
  variant: InlineLegalNoticeVariant;
  className?: string;
}

const VARIANT_COPY: Record<InlineLegalNoticeVariant, { title: string; body: React.ReactNode }> = {
  contact: {
    title: 'Helpful links',
    body: (
      <>
        Your contact details and attached tuning summary may be sent to Dugimago to answer your request.
      </>
    ),
  },
  certification: {
    title: 'Helpful links',
    body: (
      <>
        These pages explain how certified reports are handled and how they should be used.
      </>
    ),
  },
  verification: {
    title: 'Helpful links',
    body: (
      <>
        Verification checks whether a report ID matches a stored record.
      </>
    ),
  },
};

const InlineLegalNotice: React.FC<InlineLegalNoticeProps> = ({ variant, className = '' }) => {
  const copy = VARIANT_COPY[variant];

  return (
    <div className={`inline-legal-notice ${className}`.trim()}>
      <div className="inline-legal-title">{copy.title}</div>
      <p className="inline-legal-text">{copy.body}</p>
      <div className="inline-legal-links" aria-label="Related policy and help links">
        <Link className="inline-legal-link" to="/privacy">Privacy</Link>
        <Link className="inline-legal-link" to="/terms">Terms</Link>
        <Link className="inline-legal-link" to="/disclaimer">Disclaimer</Link>
        <Link className="inline-legal-link" to="/faq">Q&amp;A</Link>
      </div>
    </div>
  );
};

export default InlineLegalNotice;
