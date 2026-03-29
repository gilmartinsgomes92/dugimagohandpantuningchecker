import React from 'react';
import LegalPageLayout from '../components/LegalPageLayout';

const DisclaimerPage: React.FC = () => {
  return (
    <LegalPageLayout
      title="Disclaimer"
      subtitle="Important limits of what the app can and cannot confirm about a handpan."
    >
      <section className="legal-card">
        <p className="legal-meta"><strong>Last updated:</strong> March 29, 2026</p>
        <p>
          Dugimago Handpan Tuning Check is an analysis tool, not a guarantee of perfection, condition, or
          future stability of an instrument.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>1. Informational tool only</h3>
        <p>
          Results are intended to help users understand tuning and harmonic behavior. They should not be
          treated as the sole basis for repair decisions, valuation, authenticity claims, or purchase/sale
          decisions without additional judgment.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>2. Results depend on conditions</h3>
        <ul className="legal-list">
          <li>microphone quality and placement</li>
          <li>background noise and room acoustics</li>
          <li>playing consistency and strike quality</li>
          <li>instrument sustain, stability, and structural behavior</li>
          <li>browser and device limitations</li>
        </ul>
      </section>

      <section className="legal-card legal-section">
        <h3>3. Not a substitute for expert inspection</h3>
        <p>
          A skilled maker or tuner may still be needed to evaluate note stability, structural issues,
          overtones, shell behavior, glue or build problems, transport damage, and broader instrument quality.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>4. Certified report scope</h3>
        <p>
          A certified report reflects the measured output captured at the time the report was created. It is
          not a lifetime guarantee and does not promise that the instrument will remain unchanged afterward.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>5. User responsibility</h3>
        <p>
          You remain responsible for how you interpret, share, and rely on the app’s outputs. When the stakes
          are high, seek additional confirmation from a trusted handpan maker, tuner, or in-person evaluation.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default DisclaimerPage;
