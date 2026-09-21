/**
 * App shell — icon rail + routed pages.
 * Navigation: Dashboard, Camera Grid, Playback, Detections, Faces, Settings.
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from '@/pages/DashboardPage';
import CameraGridPage from '@/pages/CameraGridPage';
import PlaybackPage from '@/pages/PlaybackPage';
import DetectionsPage from '@/pages/DetectionsPage';
import FacesPage from '@/pages/FacesPage';
import SettingsPage from '@/pages/SettingsPage';
import AppRail from '@/components/AppRail';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export default function App() {
  return (
    <div className="app-shell">
      <AppRail />
      <main className="app-shell__main">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/grid" element={<CameraGridPage />} />
            <Route path="/playback" element={<PlaybackPage />} />
            <Route path="/playback/:cameraId" element={<PlaybackPage />} />
            <Route path="/detections" element={<DetectionsPage />} />
            <Route path="/faces" element={<FacesPage />} />
            <Route path="/settings" element={<SettingsPage />} />

            {/* Backward-compatible redirects */}
            <Route
              path="/camera/:cameraId"
              element={<Navigate to="/playback/:cameraId" replace />}
            />
            <Route path="/events" element={<Navigate to="/detections" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
