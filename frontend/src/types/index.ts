/**
 * Domain types for Aegis Vision AI frontend.
 */

export interface Camera {
  id: string;
  name: string;
  type?: string;
  rtsp_url?: string;
  online: boolean;
  fps?: number;
}

export interface CamerasResponse {
  cameras: Camera[];
}

export type EventType = 'unknown_face' | 'known_face' | 'loitering' | 'person_detected' | 'motion';

export interface PlaybackInfo {
  file: string;
  start_offset: number;
}

export interface SecurityEvent {
  id: number;
  timestamp: string;
  camera_id: string;
  event_type: EventType | string;
  person_name: string | null;
  thumbnail_path: string | null;
  playback: PlaybackInfo | null;
}

export interface EventsResponse {
  events: SecurityEvent[];
  total: number;
}

export interface EventSummary {
  total?: number;
  unknown_face?: number;
  known_face?: number;
  loitering?: number;
  person_detected?: number;
  motion?: number;
}

export interface EventsSummaryResponse {
  summary: EventSummary;
}

export interface FacePerson {
  name: string;
  images: string[];
  count?: number;
  image_count?: number;
  sightings?: number;
}

export interface FacesResponse {
  faces: FacePerson[];
}

export interface FaceImportItem {
  filename: string;
  status: 'enrolled' | 'failed' | string;
  reason?: string;
}

export interface FaceImportResponse {
  results: FaceImportItem[];
  status?: string;
  detail?: string;
}

export interface FaceStatus {
  face_found: boolean;
  pose: 'center' | 'left' | 'right' | 'up' | 'down' | 'none' | string;
  offset_x?: number;
  offset_y?: number;
}

export interface CaptureResponse {
  status: string;
  detail?: string;
}

export interface AddFaceResponse {
  status: string;
  detail?: string;
}

export interface RecordingsSummaryResponse {
  days: string[];
}

export interface TimelineHour {
  hour: number;
  segment_minutes: number;
  event_count: number;
}

export interface TimelineSegment {
  filename: string;
  start_epoch: number;
  duration_seconds: number;
}

export interface TimelineResponse {
  hours: TimelineHour[];
  segments: TimelineSegment[];
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  username: string;
}

export interface UserResponse {
  username: string;
}

export interface AuthContextValue {
  token: string | null;
  username: string | null;
  login: (usr: string, pwd: string) => Promise<void>;
  logout: () => void;
  authHeaders: () => { Authorization: string };
}

export interface SystemDiskHealth {
  total_gb: number;
  free_gb: number;
  used_gb: number;
  percent_used: number;
  recordings_gb: number;
  thumbnails_gb: number;
  database_mb: number;
}

export interface SystemHealthResponse {
  cpu_percent: number;
  memory_mb: number;
  disk: SystemDiskHealth;
  uptime_seconds: number;
  cameras_online: number;
  cameras_total: number;
  events_today: number;
}
