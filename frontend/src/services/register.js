import { apiFetch } from './core';

export const registerService = {
  async getFaceStatus() {
    return apiFetch('/register/face_status');
  },

  async captureStep(name, stepId) {
    return apiFetch(`/register/capture?name=${encodeURIComponent(name)}&step=${encodeURIComponent(stepId)}`, {
      method: 'POST',
    });
  },
};
