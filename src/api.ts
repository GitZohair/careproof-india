import type { DataHealth, FacilityDetail, FacilitySummary, Filters, ReviewDecision, Summary } from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  filters: () => request<Filters>("/api/filters"),
  summary: (capability: string, state: string) =>
    request<Summary>(`/api/summary?capability=${encodeURIComponent(capability)}&state=${encodeURIComponent(state)}`),
  facilities: (capability: string, state: string, tier: string, query: string) =>
    request<FacilitySummary[]>(
      `/api/facilities?capability=${encodeURIComponent(capability)}&state=${encodeURIComponent(state)}&tier=${encodeURIComponent(tier)}&q=${encodeURIComponent(query)}`,
    ),
  detail: (id: string, capability: string) =>
    request<FacilityDetail>(`/api/facilities/${encodeURIComponent(id)}?capability=${encodeURIComponent(capability)}`),
  review: (payload: Omit<ReviewDecision, "id">) =>
    request<ReviewDecision>("/api/reviews", { method: "POST", body: JSON.stringify(payload) }),
  dataHealth: () => request<DataHealth>("/api/data-health"),
};

