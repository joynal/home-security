import { apiFetch, API_BASE_URL } from './core';
import type { EventsResponse, EventsSummaryResponse } from '../types';

export interface GetEventsParams {
  cameraId?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
  eventType?: string;
  personName?: string;
  q?: string;
}

export const eventService = {
  async getEvents({
    cameraId,
    since,
    until,
    limit,
    offset,
    eventType,
    personName,
    q,
  }: GetEventsParams = {}): Promise<EventsResponse> {
    const params = new URLSearchParams();
    if (cameraId) params.set('camera_id', cameraId);
    if (since) params.set('since', since);
    if (until) params.set('until', until);
    if (limit !== undefined) params.set('limit', String(limit));
    if (offset !== undefined) params.set('offset', String(offset));
    if (eventType) params.set('event_type', eventType);
    if (personName) params.set('person_name', personName);
    if (q) params.set('q', q);
    const qs = params.toString();
    return apiFetch<EventsResponse>(`/events${qs ? `?${qs}` : ''}`);
  },

  async getSummary(): Promise<EventsSummaryResponse> {
    return apiFetch<EventsSummaryResponse>('/events/summary');
  },

  getThumbnailUrl(eventId: number | string): string {
    return `${API_BASE_URL}/events/${encodeURIComponent(eventId)}/thumbnail`;
  },
};
