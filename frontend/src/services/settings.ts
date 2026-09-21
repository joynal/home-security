import { apiFetch } from './core';
import type {
  AlertTestResponse,
  AppSettingsConfig,
  CameraConfigDto,
  CameraTestResponse,
  VacuumResponse,
} from '../types';

export const settingsService = {
  async getConfig(): Promise<AppSettingsConfig> {
    return apiFetch<AppSettingsConfig>('/settings/config');
  },

  async updateConfig(payload: {
    active_alert?: string;
    telegram_bot_token?: string;
    telegram_chat_id?: string;
    ntfy_topic?: string;
    retention?: {
      retain_days?: number;
      min_disk_free_gb?: number;
      delete_only_if_disk_full?: boolean;
    };
    ai?: {
      similarity_threshold?: number;
      loitering_seconds?: number;
      auto_enrichment?: boolean;
    };
  }): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>('/settings/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async addCamera(cam: CameraConfigDto): Promise<CameraConfigDto> {
    return apiFetch<CameraConfigDto>('/settings/cameras', {
      method: 'POST',
      body: JSON.stringify(cam),
    });
  },

  async updateCamera(id: string, cam: CameraConfigDto): Promise<CameraConfigDto> {
    return apiFetch<CameraConfigDto>(`/settings/cameras/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(cam),
    });
  },

  async deleteCamera(id: string): Promise<{ success: boolean; id: string }> {
    return apiFetch<{ success: boolean; id: string }>(
      `/settings/cameras/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    );
  },

  async testCamera(req: {
    type: string;
    rtsp_url?: string;
    camera_index?: number;
  }): Promise<CameraTestResponse> {
    return apiFetch<CameraTestResponse>('/settings/cameras/test', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async testAlert(req: { provider?: string; message?: string }): Promise<AlertTestResponse> {
    return apiFetch<AlertTestResponse>('/settings/alerts/test', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async vacuumDatabase(): Promise<VacuumResponse> {
    return apiFetch<VacuumResponse>('/settings/system/vacuum', {
      method: 'POST',
    });
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>('/settings/security/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
  },
};
