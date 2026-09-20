import { apiFetch, API_BASE_URL } from './core';

export const eventService = {
  async getEvents({ cameraId, since, until, limit, offset, eventType, personName } = {}) {
    const params = new URLSearchParams();
    if (cameraId) params.set('camera_id', cameraId);
    if (since) params.set('since', since);
    if (until) params.set('until', until);
    if (limit !== undefined) params.set('limit', String(limit));
    if (offset !== undefined) params.set('offset', String(offset));
    if (eventType) params.set('event_type', eventType);
    if (personName) params.set('person_name', personName);
    const qs = params.toString();
    return apiFetch(`/events${qs ? `?${qs}` : ''}`);
  },

  async getSummary() {
    return apiFetch('/events/summary');
  },

  getThumbnailUrl(eventId) {
    return `${API_BASE_URL}/events/${encodeURIComponent(eventId)}/thumbnail`;
  },
};
