import type { CapabilityBenchmark, DataHealth, EvaluationReport, FacilityDetail, FacilitySummary, Filters, MapPoint, NearestFacility, RegionSummary, ResolvedLocation, ReviewDecision, Summary } from "./types";
import { demoApi } from "./demo-api";
import { DEMO_MODE } from "./runtime";

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

const liveApi = {
  filters: () => request<Filters>("/api/filters"),
  summary: (capability: string, state: string) =>
    request<Summary>(`/api/summary?capability=${encodeURIComponent(capability)}&state=${encodeURIComponent(state)}`),
  facilities: (capability: string, state: string, tier: string, query: string) =>
    request<FacilitySummary[]>(
      `/api/facilities?capability=${encodeURIComponent(capability)}&state=${encodeURIComponent(state)}&tier=${encodeURIComponent(tier)}&q=${encodeURIComponent(query)}`,
    ),
  mapPoints: (capability: string, state: string) =>
    request<MapPoint[]>(`/api/map-points?capability=${encodeURIComponent(capability)}&state=${encodeURIComponent(state)}`),
  regions: (capability: string, state: string) =>
    request<RegionSummary[]>(`/api/regions?capability=${encodeURIComponent(capability)}&state=${encodeURIComponent(state)}`),
  capabilityBenchmark: (state: string) =>
    request<CapabilityBenchmark[]>(`/api/capability-benchmark?state=${encodeURIComponent(state)}`),
  resolveLocation: (query: string) =>
    request<ResolvedLocation>(`/api/resolve-location?q=${encodeURIComponent(query)}`),
  nearest: (capability: string, latitude: number, longitude: number) =>
    request<NearestFacility[]>(`/api/nearest?capability=${encodeURIComponent(capability)}&latitude=${latitude}&longitude=${longitude}`),
  detail: (id: string, capability: string) =>
    request<FacilityDetail>(`/api/facilities/${encodeURIComponent(id)}?capability=${encodeURIComponent(capability)}`),
  review: (payload: Omit<ReviewDecision, "id">) =>
    request<ReviewDecision>("/api/reviews", { method: "POST", body: JSON.stringify(payload) }),
  dataHealth: () => request<DataHealth>("/api/data-health"),
  evaluation: () => request<EvaluationReport>("/api/evaluation"),
};

export const api = DEMO_MODE ? demoApi : liveApi;
