import React, { FC, Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { AppStateProvider } from './utilis/useAppState';
import {
  ControlPanelSkeleton,
  ContestPageSkeleton,
  JudgePageSkeleton,
  RankingsPageSkeleton,
  CardSkeleton,
} from './components/Skeleton';

// Lazy-loaded route components for code splitting
const ControlPanel = lazy(() => import('./components/ControlPanel'));
const ContestPage = lazy(() => import('./components/ContestPage'));
const JudgePage = lazy(() => import('./components/JudgePage'));
const AdminAuditPage = lazy(() => import('./components/AdminAuditPage'));
const RankingsPage = lazy(() => import('./components/RankingsPage'));
const ThemeDemo = lazy(() => import('./components/ThemeDemo'));

// Public pages (no auth required)
const PublicHub = lazy(() => import('./components/PublicHub'));
const PublicLiveClimbing = lazy(() => import('./components/PublicLiveClimbing'));
const PublicRankings = lazy(() => import('./components/PublicRankings'));
const PublicOfficials = lazy(() => import('./components/PublicOfficials'));

// Generic fallback for pages without specific skeletons
const PageLoader: FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
      <span className="text-sm text-slate-400 tracking-wide">Loading...</span>
    </div>
  </div>
);

// Wrapper components with route-specific skeletons
const ControlPanelWithSkeleton: FC = () => (
  <Suspense fallback={<ControlPanelSkeleton />}>
    <ControlPanel />
  </Suspense>
);

const ContestPageWithSkeleton: FC = () => (
  <Suspense fallback={<ContestPageSkeleton />}>
    <ContestPage />
  </Suspense>
);

const JudgePageWithSkeleton: FC = () => (
  <Suspense fallback={<JudgePageSkeleton />}>
    <JudgePage />
  </Suspense>
);

const RankingsPageWithSkeleton: FC = () => (
  <Suspense fallback={<RankingsPageSkeleton />}>
    <RankingsPage />
  </Suspense>
);

const AdminAuditPageWithSkeleton: FC = () => (
  <Suspense fallback={<div className="min-h-screen bg-gray-900 p-6"><CardSkeleton /></div>}>
    <AdminAuditPage />
  </Suspense>
);

const App: FC = () => {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <Routes>
          <Route path="/" element={<ControlPanelWithSkeleton />} />
          <Route path="/contest/:boxId" element={<ContestPageWithSkeleton />} />
          <Route path="/judge/:boxId" element={<JudgePageWithSkeleton />} />
          <Route path="/rankings" element={<RankingsPageWithSkeleton />} />
          <Route path="/admin/audit" element={<AdminAuditPageWithSkeleton />} />
          <Route
            path="/theme-demo"
            element={
              <Suspense fallback={<PageLoader />}>
                <ThemeDemo />
              </Suspense>
            }
          />
          {/* Public routes (QR access, no auth) */}
          <Route
            path="/public"
            element={
              <Suspense fallback={<PageLoader />}>
                <PublicHub />
              </Suspense>
            }
          />
          <Route
            path="/public/rankings"
            element={
              <Suspense fallback={<RankingsPageSkeleton />}>
                <PublicRankings />
              </Suspense>
            }
          />
          <Route
            path="/public/officials"
            element={
              <Suspense fallback={<PageLoader />}>
                <PublicOfficials />
              </Suspense>
            }
          />
          <Route
            path="/public/live-climbing/:boxId"
            element={
              <Suspense fallback={<ContestPageSkeleton />}>
                <PublicLiveClimbing />
              </Suspense>
            }
          />
        </Routes>
      </AppStateProvider>
    </ErrorBoundary>
  );
};

export default App;
