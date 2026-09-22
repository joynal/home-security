/**
 * Live page — the camera grid IS the app (UniFi/Frigate pattern).
 * Story strip (recent activity) above the grid; grid is the camera list.
 * Tile click → camera detail via URL hash (U4).
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import CameraGrid from '@/components/CameraGrid';
import RecentEvents from '@/components/RecentEvents';
import { cameraService } from '@/services/cameras';
import type { Camera } from '@/types';

export default function LivePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cameras, setCameras] = useState<Camera[]>([]);

  // Poll /cameras every 10s for live status (online/offline)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchCameras = () => {
      cameraService
        .getCameras()
        .then((data) => {
          if (cancelled || !data.cameras) return;
          setCameras(data.cameras);
        })
        .catch(() => {});
    };
    fetchCameras();
    const interval = setInterval(fetchCameras, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  const online = cameras.filter((c) => c.online).length;

  const openCamera = (cameraId: string) => {
    navigate(`/camera/${cameraId}`);
  };

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">Live</span>
        <span
          className={`status-dot ${online === cameras.length && cameras.length > 0 ? 'status-dot--live' : 'status-dot--warn'}`}
        />
        <span className="status-label tnum">
          {online}/{cameras.length} online
        </span>
        <span className="page-header__spacer" />
      </header>

      <div className="page-body live-page">
        <RecentEvents limit={10} />
        {cameras.length > 0 ? (
          <CameraGrid cameras={cameras} onSelect={openCamera} />
        ) : (
          <div className="live-placeholder">
            <p>Loading cameras…</p>
          </div>
        )}
      </div>
    </>
  );
}
