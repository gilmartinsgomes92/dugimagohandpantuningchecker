import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import WelcomePage from './pages/WelcomePage';
import NotesCountSelectionPage from './pages/NotesCountSelectionPage';
import QuickTuningPage from './pages/QuickTuningPage';
import ScaleSelectionPage from './pages/ScaleSelectionPage';
import GuidedTuningPage from './pages/GuidedTuningPage';
import ResultsDashboardPage from './pages/ResultsDashboardPage';
import ContactFormPage from './pages/ContactFormPage';
import ConfirmationPage from './pages/ConfirmationPage';
import StrobeTuningPage from './pages/StrobeTuningPage';
import IdentifyNotePage from './pages/IdentifyNotePage';
import './App.css';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/notes-count-selection" element={<NotesCountSelectionPage />} />
          <Route path="/quick-tuning" element={<QuickTuningPage />} />
          <Route path="/scale-selection" element={<ScaleSelectionPage />} />
          <Route path="/guided-tuning" element={<GuidedTuningPage />} />
          <Route path="/results" element={<ResultsDashboardPage />} />
          <Route path="/contact" element={<ContactFormPage />} />
          <Route path="/confirmation" element={<ConfirmationPage />} />
          <Route path="/strobe-tuning" element={<StrobeTuningPage />} />
          <Route path="/identify-note" element={<IdentifyNotePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;