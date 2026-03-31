import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { CertificationProvider } from './contexts/CertificationContext';
import AccountAccessButton from './components/AccountAccessButton';
import WelcomePage from './pages/WelcomePage';
import NotesCountSelectionPage from './pages/NotesCountSelectionPage';
import QuickTuningPage from './pages/QuickTuningPage';
import ScaleSelectionPage from './pages/ScaleSelectionPage';
import ScaleIdentifyPage from './pages/ScaleIdentifyPage';
import GuidedTuningPage from './pages/GuidedTuningPage';
import ResultsDashboardPage from './pages/ResultsDashboardPage';
import ContactFormPage from './pages/ContactFormPage';
import ConfirmationPage from './pages/ConfirmationPage';
import StrobeTuningPage from './pages/StrobeTuningPage';
import IdentifyNotePage from './pages/IdentifyNotePage';
import TuningStartPage from './pages/TuningStartPage';
import CertificationStartPage from './pages/CertificationStartPage';
import CertificationCheckPage from './pages/CertificationCheckPage';
import CertificationReviewPage from './pages/CertificationReviewPage';
import CertificationResultsPage from './pages/CertificationResultsPage';
import VerifyReportPage from './pages/VerifyReportPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import DisclaimerPage from './pages/DisclaimerPage';
import FaqPage from './pages/FaqPage';
import LoginPage from './pages/LoginPage';
import MyReportsPage from './pages/MyReportsPage';
import './App.css';

function App() {
  return (
    <AppProvider>
      <CertificationProvider>
        <BrowserRouter>
          <AccountAccessButton />
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
        </BrowserRouter>
      </CertificationProvider>
    </AppProvider>
  );
}

export default App;
