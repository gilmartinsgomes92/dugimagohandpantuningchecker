import React from 'react';
import LegalPageLayout from '../components/LegalPageLayout';

const faqItems = [
  {
    question: 'Does the app record or store my audio?',
    answer:
      'Normal tuning and scale-identification analysis is intended to happen live in your browser. The app is not designed to store raw microphone recordings during standard tuning use.',
  },
  {
    question: 'Why does the app need microphone permission?',
    answer:
      'The app needs live microphone access to detect the fundamental, octave, and compound fifth of the notes you play. Without permission, the audio-analysis features cannot work.',
  },
  {
    question: 'Can this replace a professional maker or tuner?',
    answer:
      'No. It is a strong checking tool, but not a substitute for a skilled maker’s ear, structural evaluation, and tuning judgment.',
  },
  {
    question: 'Why does a note sometimes show missing or unclear partials?',
    answer:
      'That can happen when a harmonic is weak, masked by room noise, unstable, or difficult to isolate from the specific strike. Repeating the note cleanly and letting it sustain usually helps.',
  },
  {
    question: 'Will the app work on iPhone?',
    answer:
      'That is one of the intended platforms. For best results, allow microphone access, use a quiet room, and strike one note clearly at a time.',
  },
  {
    question: 'What is a Certified Tuning Report?',
    answer:
      'It is a shareable report intended to store a verification ID and measured results so someone else can check whether the shared report matches the original stored record.',
  },
  {
    question: 'What does Verify Report ID actually confirm?',
    answer:
      'It confirms whether the ID matches the report data stored by the app. It does not prove the instrument has stayed unchanged since that report was created.',
  },
  {
    question: 'Can the scale identifier get confused by extra bottom notes?',
    answer:
      'Yes, it can be affected when a handpan contains extra or chromatic notes outside the core scale. The identifier is best understood as a practical aid, not an absolute final authority in every extended-layout case.',
  },
  {
    question: 'What should I do if the result looks wrong?',
    answer:
      'Try again in a quieter room, keep some distance from other ringing notes, strike one note cleanly, and repeat the measurement. If needed, compare multiple strikes rather than trusting a single hit.',
  },
  {
    question: 'What information is sent when I request a professional evaluation?',
    answer:
      'Your name, email, optional phone number, message, and tuning summary are sent so Dugimago can review your request and respond.',
  },
];

const FaqPage: React.FC = () => {
  return (
    <LegalPageLayout
      title="Q&amp;A"
      subtitle="Clear answers to common questions new users may have before or after using the app."
    >
      <section className="legal-card">
        <p className="legal-meta"><strong>Last updated:</strong> March 29, 2026</p>
        <p>
          This page is written in a plain, practical way for players, buyers, and first-time users of the
          app.
        </p>
      </section>

      <section className="legal-faq-list">
        {faqItems.map((item) => (
          <details className="legal-card legal-faq-item" key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </section>
    </LegalPageLayout>
  );
};

export default FaqPage;
