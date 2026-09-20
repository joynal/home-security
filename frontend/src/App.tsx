/**
 * App shell — icon rail + routed pages.
 * The camera grid (Live) is home; Events and Faces are one click away.
 * (Login gating happens in main.tsx's Root.)
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import LivePage from '@/pages/LivePage';
import EventsPage from '@/pages/EventsPage';
import FacesPage from '@/pages/FacesPage';
import CameraDetailPage from '@/pages/CameraDetailPage';
import AppRail from '@/components/AppRail';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export default function App() {
  return (
    <div className="app-shell">
      <AppRail />
      <main className="app-shell__main">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<LivePage />} />
            <Route path="/camera/:cameraId" element={<CameraDetailPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/faces" element={<FacesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
