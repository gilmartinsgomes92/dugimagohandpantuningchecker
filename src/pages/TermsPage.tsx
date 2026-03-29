import React from 'react';
import LegalPageLayout from '../components/LegalPageLayout';

const TermsPage: React.FC = () => {
  return (
    <LegalPageLayout
      title="Terms of Use"
      subtitle="Basic terms for using Dugimago Handpan Tuning Check and its public features."
    >
      <section className="legal-card">
        <p className="legal-meta"><strong>Last updated:</strong> March 29, 2026</p>
        <p>
          By using Dugimago Handpan Tuning Check, you agree to use the app responsibly and only for lawful
          purposes. If you do not agree with these terms, please do not use the service.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>1. Intended use</h3>
        <p>
          The app is intended to help users check handpan tuning, identify scales, generate shareable results,
          and verify certified reports. It is not intended for illegal, abusive, or misleading use.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>2. Acceptable use</h3>
        <ul className="legal-list">
          <li>Do not misuse the report system to create deceptive or fraudulent claims.</li>
          <li>Do not attempt to interfere with the app, its API routes, or its verification system.</li>
          <li>Do not use the service in a way that harms Dugimago, other users, or third parties.</li>
        </ul>
      </section>

      <section className="legal-card legal-section">
        <h3>3. Accuracy and availability</h3>
        <p>
          Dugimago aims to make the app useful and reliable, but does not guarantee uninterrupted service,
          perfect accuracy, or compatibility with every device, browser, room condition, microphone, or
          instrument setup.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>4. Certified report verification</h3>
        <p>
          A verification result only confirms whether a report ID matches the stored record held by the app.
          It does not guarantee current instrument condition after the report date, later modifications,
          transport damage, retuning, or user interpretation.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>5. Intellectual property</h3>
        <p>
          The app’s branding, interface, report presentation, and original content remain the property of
          Dugimago unless otherwise stated. You may use your own results and reports for personal, educational,
          or sales-support purposes, but you may not falsely imply endorsement beyond what the app actually
          provides.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>6. Limitation of liability</h3>
        <p>
          To the maximum extent allowed by law, Dugimago is not liable for losses, damages, instrument repair
          decisions, purchase decisions, resale disputes, or business outcomes arising from use of the app or
          reliance on its outputs.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>7. Changes</h3>
        <p>
          Dugimago may update the app, these terms, and related pages from time to time. Continued use after
          updates means you accept the revised terms.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default TermsPage;
