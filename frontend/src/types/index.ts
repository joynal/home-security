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

/** Raw shape returned by GET /recordings/{cam}/timeline — ISO UTC instants + absolute path. */
export interface TimelineSegment {
  start: string;
  end: string;
  file: string;
}

/** Client-normalized segment for seeking + rail coverage (epoch seconds, basename). */
export interface NormalizedSegment {
  name: string;
  startEpoch: number;
  endEpoch: number;
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

export interface AppRetentionConfig {
  retain_days: number;
  min_disk_free_gb: number;
  delete_only_if_disk_full: boolean;
}

export interface AppAIConfig {
  similarity_threshold: number;
  loitering_seconds: number;
  auto_enrichment: boolean;
}

export interface AppAlertsConfig {
  active: string;
  telegram_configured: boolean;
  telegram_chat_id: string;
  ntfy_topic: string;
}

export interface ZoneDto {
  name: string;
  coordinates: number[][];
}

export interface CameraConfigDto {
  id: string;
  name: string;
  type: string;
  enabled?: boolean;
  rtsp_url?: string | null;
  rtsp_sub_url?: string | null;
  camera_index?: number;
  detect?: {
    width?: number;
    height?: number;
    fps?: number;
    enabled?: boolean;
  };
  record?: {
    enabled?: boolean;
    retain_days?: number;
    segment_seconds?: number;
    delete_only_if_disk_full?: boolean;
    min_disk_free_gb?: number;
  };
  zones?: ZoneDto[];
}

export interface AppSettingsConfig {
  cameras: CameraConfigDto[];
  active_alert: string;
  retention: AppRetentionConfig;
  ai: AppAIConfig;
  alerts: AppAlertsConfig;
}

export interface VacuumResponse {
  success: boolean;
  size_before_mb: number;
  size_after_mb: number;
}

export interface CameraTestResponse {
  success: boolean;
  width?: number;
  height?: number;
  fps?: number;
  error?: string | null;
}

export interface AlertTestResponse {
  success: boolean;
  detail: string;
}
