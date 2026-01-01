import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { AppStateProvider } from './utilis/useAppState';
import ControlPanel from './components/ControlPanel';
import ContestPage from './components/ContestPage';
import JudgePage from './components/JudgePage';

function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <Routes>
          <Route path="/" element={<ControlPanel />} />
          <Route path="/contest/:boxId" element={<ContestPage />} />
          <Route path="/judge/:boxId" element={<JudgePage />} />
        </Routes>
      </AppStateProvider>
    </ErrorBoundary>
  );
}

export default App;
