import type {
  CapabilityBenchmark,
  DataHealth,
  EvaluationReport,
  FacilityDetail,
  FacilitySummary,
  Filters,
  MapPoint,
  NearestFacility,
  RegionSummary,
  ResolvedLocation,
  ReviewDecision,
  Summary,
} from "./types";

interface DemoSnapshot {
  filters: Filters;
  summaries: Record<string, Summary>;
  facilities: Record<string, FacilitySummary[]>;
  map_points: Record<string, MapPoint[]>;
  regions: Record<string, RegionSummary[]>;
  benchmark: CapabilityBenchmark[];
  locations: Record<string, ResolvedLocation>;
  nearest: Record<string, Record<string, NearestFacility[]>>;
  details: Record<string, FacilityDetail>;
  data_health: DataHealth;
  evaluation: EvaluationReport;
}

let snapshotPromise: Promise<DemoSnapshot> | null = null;
const demoReviews = new Map<string, ReviewDecision>();

function snapshot() {
  snapshotPromise ??= fetch(`${import.meta.env.BASE_URL}demo-snapshot.json`).then((response) => {
    if (!response.ok) throw new Error("The public demo snapshot could not be loaded.");
    return response.json() as Promise<DemoSnapshot>;
  });
  return snapshotPromise;
}

function detailKey(capability: string, facilityId: string) {
  return `${capability}::${facilityId}`;
}

function distanceSquared(left: ResolvedLocation, latitude: number, longitude: number) {
  return (left.latitude - latitude) ** 2 + (left.longitude - longitude) ** 2;
}

function fallbackDetail(facility: FacilitySummary): FacilityDetail {
  return {
    ...facility,
    pincode: null,
    address: null,
    description: null,
    capacity: null,
    number_doctors: null,
    component_direct: facility.component_direct ?? 0,
    component_equipment: facility.component_equipment ?? 0,
    component_staff: facility.component_staff ?? 0,
    component_capacity: facility.component_capacity ?? 0,
    component_procedure: facility.component_procedure ?? 0,
    component_sources: facility.component_sources ?? 0,
    evidence: [],
    gaps: ["Sentence-level receipts for this map point are available in the full Databricks application."],
    source_urls: [],
    last_review: demoReviews.get(detailKey(facility.capability, facility.facility_id)) ?? null,
  };
}

export const demoApi = {
  filters: async () => (await snapshot()).filters,
  summary: async (capability: string, _state: string) => (await snapshot()).summaries[capability],
  facilities: async (capability: string, _state: string, tier: string, query: string) => {
    const rows = (await snapshot()).facilities[capability] ?? [];
    const needle = query.trim().toLowerCase();
    return rows.filter((item) => (tier === "ALL" || item.tier === tier) && (!needle || [item.name, item.city, item.district].filter(Boolean).join(" ").toLowerCase().includes(needle)));
  },
  mapPoints: async (capability: string, _state: string) => (await snapshot()).map_points[capability] ?? [],
  regions: async (capability: string, _state: string) => (await snapshot()).regions[capability] ?? [],
  capabilityBenchmark: async (_state: string) => (await snapshot()).benchmark,
  resolveLocation: async (query: string) => {
    const data = await snapshot();
    const normalized = query.trim().toLowerCase();
    const location = data.locations[normalized];
    if (!location) throw new Error("The public demo supports Jaipur, Pune, and Lucknow scenarios.");
    return location;
  },
  nearest: async (capability: string, latitude: number, longitude: number) => {
    const data = await snapshot();
    const locationEntry = Object.entries(data.locations).filter(([key]) => !/^\d+$/.test(key)).sort((left, right) => distanceSquared(left[1], latitude, longitude) - distanceSquared(right[1], latitude, longitude))[0];
    return data.nearest[capability]?.[locationEntry?.[0] ?? "jaipur"] ?? [];
  },
  detail: async (id: string, capability: string) => {
    const data = await snapshot();
    const key = detailKey(capability, id);
    const exact = data.details[key];
    if (exact) return { ...exact, last_review: demoReviews.get(key) ?? exact.last_review };
    const facility = data.facilities[capability]?.find((item) => item.facility_id === id)
      ?? Object.values(data.nearest[capability] ?? {}).flat().find((item) => item.facility_id === id);
    if (facility) return fallbackDetail(facility);
    const point = data.map_points[capability]?.find((item) => item.facility_id === id);
    if (!point) throw new Error("Facility detail is not included in the public snapshot.");
    return fallbackDetail({ ...point, capability, claimed: false, facet_count: 0, source_domain_count: 0, flags: [], review_status: null });
  },
  review: async (payload: Omit<ReviewDecision, "id">) => {
    const review: ReviewDecision = { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString(), reviewer_email: "public-demo" };
    demoReviews.set(detailKey(payload.capability, payload.facility_id), review);
    return review;
  },
  dataHealth: async () => (await snapshot()).data_health,
  evaluation: async () => (await snapshot()).evaluation,
};
