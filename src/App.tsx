import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import WelcomePage from './pages/WelcomePage';
import ScaleSelectionPage from './pages/ScaleSelectionPage';
import GuidedTuningPage from './pages/GuidedTuningPage';
import ResultsDashboardPage from './pages/ResultsDashboardPage';
import ContactFormPage from './pages/ContactFormPage';
import ConfirmationPage from './pages/ConfirmationPage';
import './App.css';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/scale-selection" element={<ScaleSelectionPage />} />
          <Route path="/guided-tuning" element={<GuidedTuningPage />} />
          <Route path="/results" element={<ResultsDashboardPage />} />
          <Route path="/contact" element={<ContactFormPage />} />
          <Route path="/confirmation" element={<ConfirmationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;