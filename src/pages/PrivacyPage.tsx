import React from 'react';
import { Link } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';

const PrivacyPage: React.FC = () => {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      subtitle="How Dugimago Handpan Tuning Check handles microphone, report, and contact data."
    >
      <section className="legal-card">
        <p className="legal-meta"><strong>Last updated:</strong> March 29, 2026</p>
        <p>
          Dugimago Handpan Tuning Check is designed to analyze handpan notes directly in your browser.
          The app aims to keep the core tuning analysis privacy-friendly by processing live microphone
          input on your device during normal use.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>1. What the app processes</h3>
        <ul className="legal-list">
          <li>
            <strong>Live microphone audio:</strong> used to detect pitch and harmonic information while
            you use tuning and scale-identification tools.
          </li>
          <li>
            <strong>Certified report data:</strong> if you create a Certified Tuning Report, the report
            information may be stored so the verification ID can be checked later.
          </li>
          <li>
            <strong>Contact form details:</strong> if you request a professional evaluation, the app sends
            the name, email, optional phone number, message, and tuning summary you provide.
          </li>
        </ul>
      </section>

      <section className="legal-card legal-section">
        <h3>2. What is not stored in normal use</h3>
        <ul className="legal-list">
          <li>Normal tuning and scale-identification microphone analysis is intended to happen in-browser.</li>
          <li>The app is not designed to upload or store raw audio recordings during standard tuning use.</li>
          <li>The app does not currently require account creation for public use.</li>
        </ul>
      </section>

      <section className="legal-card legal-section">
        <h3>3. Certified reports</h3>
        <p>
          When you create a Certified Tuning Report, Dugimago may store the report details needed to keep a
          verification record, such as the verification ID, timestamp, note results, and report statistics.
          This allows the <Link to="/verify">Verify Report ID</Link> page to confirm whether a shared
          certificate matches the stored original.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>4. Contact requests</h3>
        <p>
          When you submit the “Request Professional Evaluation” form, your submission is sent through the
          app’s form-processing service so Dugimago can review and respond to your request. Please only
          include information you are comfortable sharing for that purpose.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>5. How information is used</h3>
        <ul className="legal-list">
          <li>To run the tuning, certification, verification, and scale-identification features.</li>
          <li>To respond to support or professional evaluation requests you submit.</li>
          <li>To maintain report authenticity for verification purposes.</li>
          <li>To improve reliability, prevent misuse, and operate the service.</li>
        </ul>
      </section>

      <section className="legal-card legal-section">
        <h3>6. Third-party services</h3>
        <p>
          The app may rely on service providers for hosting, form handling, and report storage. These
          providers may process the minimum technical information needed to deliver the service.
        </p>
      </section>

      <section className="legal-card legal-section">
        <h3>7. Your choices</h3>
        <ul className="legal-list">
          <li>You can decline microphone permission, but core audio-analysis features will not work.</li>
          <li>You can avoid report storage by not creating a Certified Tuning Report.</li>
          <li>You can avoid sharing contact data by not submitting the contact form.</li>
        </ul>
      </section>

      <section className="legal-card legal-section">
        <h3>8. Contact</h3>
        <p>
          For privacy-related requests, corrections, or deletion inquiries related to stored report or contact
          information, please reach out through the in-app contact flow or Dugimago’s public contact channel.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default PrivacyPage;
