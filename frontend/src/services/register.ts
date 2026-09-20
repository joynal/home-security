import { apiFetch } from './core';
import type { FaceStatus, CaptureResponse } from '../types';

export const registerService = {
  async getFaceStatus(): Promise<FaceStatus> {
    return apiFetch<FaceStatus>('/register/face_status');
  },

  async captureStep(name: string, stepId: string): Promise<CaptureResponse> {
    return apiFetch<CaptureResponse>(
      `/register/capture?name=${encodeURIComponent(name)}&step=${encodeURIComponent(stepId)}`,
      {
        method: 'POST',
      },
    );
  },
};
