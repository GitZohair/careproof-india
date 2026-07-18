export type TrustTier = "STRONG" | "MODERATE" | "WEAK" | "INSUFFICIENT" | "NEEDS_REVIEW";

export interface Summary {
  total: number;
  strong: number;
  moderate: number;
  weak: number;
  insufficient: number;
  needs_review: number;
  location_issues: number;
  reviewed: number;
}

export interface FacilitySummary {
  facility_id: string;
  name: string;
  city: string | null;
  state: string | null;
  district: string | null;
  capability: string;
  claimed: boolean;
  evidence_strength: number;
  tier: TrustTier;
  facet_count: number;
  source_domain_count: number;
  location_confidence: string;
  latitude: number | null;
  longitude: number | null;
  flags: string[];
  review_status: string | null;
}

export interface MapPoint {
  facility_id: string;
  name: string;
  city: string | null;
  state: string | null;
  district: string | null;
  evidence_strength: number;
  tier: TrustTier;
  location_confidence: string;
  latitude: number;
  longitude: number;
}

export interface RegionSummary {
  state: string;
  district: string;
  facilities: number;
  strong: number;
  moderate: number;
  weak: number;
  insufficient: number;
  needs_review: number;
  location_issues: number;
  mean_evidence_strength: number;
  evidence_gap: number;
  reliable_share: number;
}

export interface ResolvedLocation {
  label: string;
  state: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  matched_facilities: number;
}

export interface NearestFacility extends FacilitySummary {
  distance_km: number;
}

export interface EvidenceReceipt {
  evidence_type: string;
  source_field: string;
  quote: string;
  supports: boolean;
}

export interface FacilityDetail extends FacilitySummary {
  pincode: number | null;
  address: string | null;
  description: string | null;
  capacity: number | null;
  number_doctors: number | null;
  component_direct: number;
  component_equipment: number;
  component_staff: number;
  component_capacity: number;
  component_procedure: number;
  component_sources: number;
  evidence: EvidenceReceipt[];
  gaps: string[];
  source_urls: string[];
  last_review: ReviewDecision | null;
}

export interface ReviewDecision {
  id: string;
  facility_id: string;
  capability: string;
  decision: "CONFIRM" | "VERIFY" | "OVERRIDE";
  override_tier?: TrustTier | null;
  note: string;
  reviewer_email?: string | null;
  created_at?: string | null;
}

export interface Filters {
  states: string[];
  capabilities: { code: string; label: string }[];
}

export interface DataHealth {
  total_records: number;
  unique_facilities: number;
  raw_state_values: number;
  coordinate_conflicts: number;
  pin_join_rate: number;
  nfhs_join_rate: number;
  coverage: { field: string; value: number }[];
  capability_evidence: { capability: string; claimed: number; supported: number }[];
}
