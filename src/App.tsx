import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { CertificationProvider } from './contexts/CertificationContext';
import AccountAccessButton from './components/AccountAccessButton';
import './App.css';

const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const NotesCountSelectionPage = lazy(() => import('./pages/NotesCountSelectionPage'));
const QuickTuningPage = lazy(() => import('./pages/QuickTuningPage'));
const ScaleSelectionPage = lazy(() => import('./pages/ScaleSelectionPage'));
const ScaleIdentifyPage = lazy(() => import('./pages/ScaleIdentifyPage'));
const GuidedTuningPage = lazy(() => import('./pages/GuidedTuningPage'));
const ResultsDashboardPage = lazy(() => import('./pages/ResultsDashboardPage'));
const ContactFormPage = lazy(() => import('./pages/ContactFormPage'));
const ConfirmationPage = lazy(() => import('./pages/ConfirmationPage'));
const StrobeTuningPage = lazy(() => import('./pages/StrobeTuningPage'));
const IdentifyNotePage = lazy(() => import('./pages/IdentifyNotePage'));
const TuningStartPage = lazy(() => import('./pages/TuningStartPage'));
const CertificationStartPage = lazy(() => import('./pages/CertificationStartPage'));
const CertificationCheckPage = lazy(() => import('./pages/CertificationCheckPage'));
const CertificationReviewPage = lazy(() => import('./pages/CertificationReviewPage'));
const CertificationResultsPage = lazy(() => import('./pages/CertificationResultsPage'));
const VerifyReportPage = lazy(() => import('./pages/VerifyReportPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const DisclaimerPage = lazy(() => import('./pages/DisclaimerPage'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const MyReportsPage = lazy(() => import('./pages/MyReportsPage'));

function RouteLoadingFallback() {
  return (
    <div className="page results-page">
      <div className="cert-start-card cert-start-card-muted">Loading…</div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <CertificationProvider>
        <BrowserRouter>
          <AccountAccessButton />
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<WelcomePage />} />
              <Route path="/notes-count-selection" element={<NotesCountSelectionPage />} />
              <Route path="/quick-tuning" element={<QuickTuningPage />} />
              <Route path="/scale-selection" element={<ScaleSelectionPage />} />
              <Route path="/scale-identify" element={<ScaleIdentifyPage />} />
              <Route path="/guided-tuning" element={<GuidedTuningPage />} />
              <Route path="/results" element={<ResultsDashboardPage />} />
              <Route path="/contact" element={<ContactFormPage />} />
              <Route path="/confirmation" element={<ConfirmationPage />} />
              <Route path="/strobe-tuning" element={<StrobeTuningPage />} />
              <Route path="/identify-note" element={<IdentifyNotePage />} />
              <Route path="/tuning/start" element={<TuningStartPage />} />
              <Route path="/tuning/identify-note" element={<IdentifyNotePage />} />
              <Route path="/tuning/strobe-measurement" element={<StrobeTuningPage />} />
              <Route path="/tuning/results" element={<ResultsDashboardPage />} />
              <Route path="/certification/start" element={<CertificationStartPage />} />
              <Route path="/certification/check" element={<CertificationCheckPage />} />
              <Route path="/certification/review" element={<CertificationReviewPage />} />
              <Route path="/certification/results" element={<CertificationResultsPage />} />
              <Route path="/verify" element={<VerifyReportPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/disclaimer" element={<DisclaimerPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/my-reports" element={<MyReportsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CertificationProvider>
    </AppProvider>
  );
}

export default App;
