import React from 'react';
import { Link } from 'react-router-dom';

type InlineLegalNoticeVariant = 'contact' | 'certification' | 'verification';

interface InlineLegalNoticeProps {
  variant: InlineLegalNoticeVariant;
  className?: string;
}

const VARIANT_COPY: Record<InlineLegalNoticeVariant, { title: string; body: React.ReactNode }> = {
  contact: {
    title: 'Before you submit',
    body: (
      <>
        Your contact details and attached tuning summary will be sent to Dugimago to answer your request.
        Read the Privacy page for data handling details and the Disclaimer page for how these results should be used.
      </>
    ),
  },
  certification: {
    title: 'Before you issue or share a certified report',
    body: (
      <>
        Certified reports may be stored with a verification ID so the original record can be checked later.
        Read the Terms, Privacy, and Disclaimer pages before relying on a certificate in a sale, purchase, or evaluation.
      </>
    ),
  },
  verification: {
    title: 'Before you rely on a verification result',
    body: (
      <>
        Verification confirms whether the entered ID matches a stored report record. It does not replace an in-person expert assessment of the instrument.
        See the Disclaimer and Q&amp;A pages for important context.
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
