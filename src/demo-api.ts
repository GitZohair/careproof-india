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
  state_summaries?: Record<string, Record<string, Summary>>;
  facilities: Record<string, FacilitySummary[]>;
  map_points: Record<string, MapPoint[]>;
  regions: Record<string, RegionSummary[]>;
  state_regions?: Record<string, Record<string, RegionSummary[]>>;
  benchmark: CapabilityBenchmark[];
  state_benchmarks?: Record<string, CapabilityBenchmark[]>;
  locations: Record<string, ResolvedLocation>;
  nearest: Record<string, Record<string, NearestFacility[]>>;
  details: Record<string, FacilityDetail>;
  data_health: DataHealth;
  evaluation: EvaluationReport;
}

let snapshotPromise: Promise<DemoSnapshot> | null = null;
const demoReviews = new Map<string, ReviewDecision>();
const DEMO_STATES = [
  "Andhra Pradesh",
  "Gujarat",
  "Haryana",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Uttar Pradesh",
  "West Bengal",
];

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

function inState<T extends { state: string | null }>(rows: T[], state: string) {
  return state === "ALL" ? rows : rows.filter((item) => item.state === state);
}

function summaryFromPoints(points: MapPoint[]): Summary {
  const count = (tier: string) => points.filter((item) => item.tier === tier).length;
  return {
    total: points.length,
    strong: count("STRONG"),
    moderate: count("MODERATE"),
    weak: count("WEAK"),
    insufficient: count("INSUFFICIENT"),
    needs_review: count("NEEDS_REVIEW"),
    location_issues: points.filter((item) => ["PIN_FALLBACK", "UNKNOWN"].includes(item.location_confidence)).length,
    reviewed: 0,
  };
}

function regionsFromPoints(points: MapPoint[]): RegionSummary[] {
  const groups = new Map<string, MapPoint[]>();
  points.forEach((point) => {
    if (!point.district) return;
    groups.set(point.district, [...(groups.get(point.district) ?? []), point]);
  });
  return [...groups.entries()]
    .map(([district, rows]) => {
      const summary = summaryFromPoints(rows);
      const defensible = summary.strong + summary.moderate;
      return {
        state: rows[0]?.state ?? "",
        district,
        facilities: rows.length,
        strong: summary.strong,
        moderate: summary.moderate,
        weak: summary.weak,
        insufficient: summary.insufficient,
        needs_review: summary.needs_review,
        location_issues: summary.location_issues,
        mean_evidence_strength: Number((rows.reduce((sum, item) => sum + item.evidence_strength, 0) / rows.length).toFixed(1)),
        evidence_gap: rows.length - defensible,
        reliable_share: Number(((100 * defensible) / rows.length).toFixed(1)),
      };
    })
    .sort((left, right) => right.evidence_gap - left.evidence_gap || left.reliable_share - right.reliable_share)
    .slice(0, 10);
}

function benchmarkFromPoints(data: DemoSnapshot, state: string): CapabilityBenchmark[] {
  return data.filters.capabilities.map(({ code }) => {
    const rows = inState(data.map_points[code] ?? [], state);
    const defensible = rows.filter((item) => ["STRONG", "MODERATE"].includes(item.tier)).length;
    return {
      capability: code,
      total: rows.length,
      defensible,
      evidence_gap: rows.length - defensible,
      defensible_share: rows.length ? Number(((100 * defensible) / rows.length).toFixed(1)) : 0,
      mean_score: rows.length ? Number((rows.reduce((sum, item) => sum + item.evidence_strength, 0) / rows.length).toFixed(1)) : 0,
    };
  });
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
  filters: async () => ({ ...(await snapshot()).filters, states: DEMO_STATES }),
  summary: async (capability: string, state: string) => {
    const data = await snapshot();
    if (state === "ALL") return data.summaries[capability];
    return data.state_summaries?.[capability]?.[state] ?? summaryFromPoints(inState(data.map_points[capability] ?? [], state));
  },
  facilities: async (capability: string, state: string, tier: string, query: string) => {
    const rows = inState((await snapshot()).facilities[capability] ?? [], state);
    const needle = query.trim().toLowerCase();
    return rows.filter((item) => (tier === "ALL" || item.tier === tier) && (!needle || [item.name, item.city, item.district].filter(Boolean).join(" ").toLowerCase().includes(needle)));
  },
  mapPoints: async (capability: string, state: string) => inState((await snapshot()).map_points[capability] ?? [], state),
  regions: async (capability: string, state: string) => {
    const data = await snapshot();
    if (state === "ALL") return data.regions[capability] ?? [];
    return data.state_regions?.[capability]?.[state] ?? regionsFromPoints(inState(data.map_points[capability] ?? [], state));
  },
  capabilityBenchmark: async (state: string) => {
    const data = await snapshot();
    if (state === "ALL") return data.benchmark;
    return data.state_benchmarks?.[state] ?? benchmarkFromPoints(data, state);
  },
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
