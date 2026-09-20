import { apiFetch, API_BASE_URL } from './core';

export const faceService = {
  async getFaces() {
    return apiFetch('/faces');
  },

  async deleteFace(name) {
    return apiFetch(`/faces/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  },

  async importFaces(name, files) {
    const form = new FormData();
    form.append('name', name.trim());
    files.forEach(f => form.append('files', f, f.name));
    return apiFetch('/faces/import', {
      method: 'POST',
      body: form,
    });
  },

  async addFaceFromEvent(name, eventId) {
    return apiFetch(`/faces/${encodeURIComponent(name.trim())}/add`, {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId }),
    });
  },

  getFaceImageUrl(name, filename) {
    return `${API_BASE_URL}/faces/${encodeURIComponent(name)}/img/${encodeURIComponent(filename)}`;
  },
};
