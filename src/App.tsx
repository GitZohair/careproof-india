import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  FileCheck2,
  Filter,
  Flag,
  Hospital,
  Info,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "./api";
import type { FacilitySummary, ReviewDecision, TrustTier } from "./types";

const FALLBACK_CAPABILITIES = [
  { code: "ICU", label: "ICU" },
  { code: "NICU", label: "NICU" },
  { code: "EMERGENCY", label: "Emergency" },
  { code: "MATERNITY", label: "Maternity" },
  { code: "ONCOLOGY", label: "Oncology" },
  { code: "TRAUMA", label: "Trauma" },
];

const TIER_LABEL: Record<TrustTier, string> = {
  STRONG: "Strong evidence",
  MODERATE: "Moderate evidence",
  WEAK: "Weak evidence",
  INSUFFICIENT: "Insufficient evidence",
  NEEDS_REVIEW: "Needs review",
};

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source link";
  }
}

function TierBadge({ tier }: { tier: TrustTier }) {
  return <span className={`tier tier--${tier.toLowerCase()}`}>{TIER_LABEL[tier]}</span>;
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="skeleton-list" aria-label="Loading facilities">
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="skeleton-row" key={item}>
          <i />
          <div><b /><span /></div>
          <em />
        </div>
      ))}
    </div>
  );
}

function App() {
  const [view, setView] = useState<"workbench" | "health" | "methodology">("workbench");
  const [capability, setCapability] = useState("ICU");
  const [state, setState] = useState("Maharashtra");
  const [tier, setTier] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = useQuery({ queryKey: ["filters"], queryFn: api.filters });
  const summary = useQuery({
    queryKey: ["summary", capability, state],
    queryFn: () => api.summary(capability, state),
    enabled: view === "workbench",
  });
  const facilities = useQuery({
    queryKey: ["facilities", capability, state, tier, query],
    queryFn: () => api.facilities(capability, state, tier, query),
    enabled: view === "workbench",
  });
  const detail = useQuery({
    queryKey: ["facility", selectedId, capability],
    queryFn: () => api.detail(selectedId!, capability),
    enabled: Boolean(selectedId),
  });

  const capabilities = filters.data?.capabilities ?? FALLBACK_CAPABILITIES;
  const states = filters.data?.states ?? ["Maharashtra"];
  const resultCount = facilities.data?.length ?? 0;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("workbench")} aria-label="CareProof home">
          <span className="brand-mark"><ShieldCheck size={19} /></span>
          <span><strong>CareProof</strong><small>India</small></span>
        </button>
        <nav aria-label="Primary navigation">
          <button className={view === "workbench" ? "active" : ""} onClick={() => setView("workbench")}>Trust desk</button>
          <button className={view === "health" ? "active" : ""} onClick={() => setView("health")}>Dataset health</button>
          <button className={view === "methodology" ? "active" : ""} onClick={() => setView("methodology")}>Methodology</button>
        </nav>
        <div className="topbar-context"><span className="live-dot" /> Live Databricks data</div>
      </header>

      {view === "workbench" && (
        <main>
          <section className="intro-strip">
            <div>
              <p className="eyebrow">Facility Trust Desk</p>
              <h1>Claims ranked by evidence, not optimism.</h1>
              <p>Inspect what supports a facility capability, what is missing, and what requires human verification.</p>
            </div>
            <div className="disclaimer"><Info size={16} /><span>Evidence strength is not clinical accreditation or real-time availability.</span></div>
          </section>

          <section className="controls" aria-label="Facility filters">
            <div className="capability-tabs">
              <label>Capability</label>
              <div>
                {capabilities.map((item) => (
                  <button
                    key={item.code}
                    className={capability === item.code ? "selected" : ""}
                    onClick={() => { setCapability(item.code); setSelectedId(null); }}
                  >{item.label}</button>
                ))}
              </div>
            </div>
            <label className="select-control">
              <span>State or territory</span>
              <select value={state} onChange={(event) => { setState(event.target.value); setSelectedId(null); }}>
                <option value="ALL">All India</option>
                {states.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>
            <label className="search-control">
              <span>Find a facility</span>
              <div><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, city or district" /></div>
            </label>
          </section>

          <section className="metrics-grid" aria-label="Evidence summary">
            <Metric label="Facilities assessed" value={summary.data?.total ?? "—"} />
            <Metric label="Strong evidence" value={summary.data?.strong ?? "—"} tone="strong" />
            <Metric label="Needs review" value={summary.data?.needs_review ?? "—"} tone="review" />
            <Metric label="Location issues" value={summary.data?.location_issues ?? "—"} tone="warning" />
            <Metric label="Human-reviewed" value={summary.data?.reviewed ?? 0} />
          </section>

          <section className="workspace">
            <div className="results-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Ranked facilities</p>
                  <h2>{capability} evidence in {state === "ALL" ? "India" : state}</h2>
                </div>
                <div className="results-actions">
                  <span>{resultCount} shown</span>
                  <select aria-label="Filter by evidence tier" value={tier} onChange={(event) => setTier(event.target.value)}>
                    <option value="ALL">All tiers</option>
                    <option value="STRONG">Strong</option>
                    <option value="MODERATE">Moderate</option>
                    <option value="WEAK">Weak</option>
                    <option value="INSUFFICIENT">Insufficient</option>
                    <option value="NEEDS_REVIEW">Needs review</option>
                  </select>
                </div>
              </div>
              <div className="table-head"><span>Facility</span><span>Evidence</span><span>Signals</span><span /></div>
              {facilities.isLoading ? <SkeletonRows /> : facilities.isError ? (
                <div className="empty-state"><AlertTriangle /><h3>Data service is warming up</h3><p>Retry in a moment. Free Edition warehouses can take time to start.</p><button onClick={() => facilities.refetch()}>Retry</button></div>
              ) : resultCount === 0 ? (
                <div className="empty-state"><Filter /><h3>No facilities match these filters</h3><p>Broaden the geography or include another evidence tier.</p></div>
              ) : (
                <div className="facility-list">
                  {facilities.data?.map((facility, index) => (
                    <FacilityRow key={facility.facility_id} facility={facility} rank={index + 1} selected={selectedId === facility.facility_id} onSelect={() => setSelectedId(facility.facility_id)} />
                  ))}
                </div>
              )}
            </div>
            <EvidenceLandscape facilities={facilities.data ?? []} capability={capability} />
          </section>
        </main>
      )}

      {view === "health" && <DataHealthView />}
      {view === "methodology" && <MethodologyView />}

      {selectedId && (
        <DetailPanel
          detail={detail.data}
          loading={detail.isLoading}
          onClose={() => setSelectedId(null)}
          onReviewed={() => { detail.refetch(); summary.refetch(); facilities.refetch(); }}
        />
      )}
    </div>
  );
}

function FacilityRow({ facility, rank, selected, onSelect }: { facility: FacilitySummary; rank: number; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`facility-row ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="facility-main">
        <span className="rank">{String(rank).padStart(2, "0")}</span>
        <div><strong>{facility.name}</strong><span><MapPin size={13} /> {[facility.city, facility.district, facility.state].filter(Boolean).join(", ")}</span></div>
      </div>
      <div className="facility-evidence"><TierBadge tier={facility.tier} /><b>{facility.evidence_strength}</b><small>/100</small></div>
      <div className="facility-signals">
        <span>{facility.facet_count} facets</span>
        <span>{facility.source_domain_count} domains</span>
        {facility.flags.length > 0 && <span className="flag-count"><Flag size={12} /> {facility.flags.length}</span>}
      </div>
      <ChevronRight size={17} />
    </button>
  );
}

function EvidenceLandscape({ facilities, capability }: { facilities: FacilitySummary[]; capability: string }) {
  const counts = useMemo(() => {
    const buckets: Record<string, number> = { STRONG: 0, MODERATE: 0, WEAK: 0, INSUFFICIENT: 0, NEEDS_REVIEW: 0 };
    facilities.forEach((facility) => { buckets[facility.tier] += 1; });
    return Object.entries(buckets).map(([name, value]) => ({ name: name.replace("_", " "), value }));
  }, [facilities]);
  return (
    <aside className="landscape-panel">
      <div className="panel-heading"><div><p className="eyebrow">Evidence landscape</p><h2>{capability} signal mix</h2></div><Sparkles size={18} /></div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={counts} margin={{ top: 12, right: 4, left: -18, bottom: 20 }}>
            <CartesianGrid vertical={false} stroke="#dbe3df" strokeDasharray="3 4" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#65736f" }} angle={-18} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "#65736f" }} allowDecimals={false} />
            <Tooltip cursor={{ fill: "#eef3f0" }} contentStyle={{ borderRadius: 8, borderColor: "#d4ddd8" }} />
            <Bar dataKey="value" fill="#176f68" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="landscape-note"><CircleHelp size={17} /><p><strong>Why this is not a map yet</strong><br />Coordinates that disagree with their PIN are replaced or flagged before spatial decisions are shown.</p></div>
      <div className="mini-ledger">
        <span><i className="dot dot--strong" /> Strong</span>
        <span><i className="dot dot--moderate" /> Moderate</span>
        <span><i className="dot dot--weak" /> Weak</span>
        <span><i className="dot dot--review" /> Review</span>
      </div>
    </aside>
  );
}

function DetailPanel({ detail, loading, onClose, onReviewed }: { detail: Awaited<ReturnType<typeof api.detail>> | undefined; loading: boolean; onClose: () => void; onReviewed: () => void }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="detail-drawer" aria-label="Facility evidence dossier">
        <button className="drawer-close" onClick={onClose} aria-label="Close dossier"><X size={19} /></button>
        {loading || !detail ? <div className="drawer-loading"><span /><span /><span /></div> : (
          <>
            <div className="dossier-header">
              <p className="eyebrow">Evidence dossier · {detail.capability}</p>
              <h2>{detail.name}</h2>
              <p><MapPin size={14} /> {[detail.city, detail.district, detail.state].filter(Boolean).join(", ")}</p>
              <div className="dossier-verdict"><TierBadge tier={detail.tier} /><strong>{detail.evidence_strength}<small>/100</small></strong></div>
              <p className="verdict-copy">This measures visible evidence strength—not accreditation, availability, or clinical quality.</p>
            </div>

            <section className="dossier-section">
              <div className="section-title"><h3>Why this score</h3><span>v1.0 deterministic model</span></div>
              <div className="component-grid">
                {[
                  ["Direct statement", detail.component_direct, 30],
                  ["Equipment", detail.component_equipment, 20],
                  ["Staff & specialty", detail.component_staff, 20],
                  ["Capacity", detail.component_capacity, 10],
                  ["Procedures", detail.component_procedure, 10],
                  ["Source diversity", detail.component_sources, 10],
                ].map(([label, value, max]) => (
                  <div className="component" key={String(label)}><span>{label}</span><div><i style={{ width: `${(Number(value) / Number(max)) * 100}%` }} /></div><b>{value}/{max}</b></div>
                ))}
              </div>
            </section>

            {detail.flags.length > 0 && <section className="dossier-section flags-section"><div className="section-title"><h3>Verification flags</h3><span>{detail.flags.length} found</span></div>{detail.flags.map((flag) => <div className="quality-flag" key={flag}><AlertTriangle size={16} /><span>{flag.replaceAll("_", " ")}</span></div>)}</section>}

            <section className="dossier-section">
              <div className="section-title"><h3>Evidence receipts</h3><span>{detail.evidence.length} excerpts</span></div>
              <div className="receipt-list">
                {detail.evidence.length === 0 ? <p className="muted">No supporting excerpts were found outside the capability claim.</p> : detail.evidence.map((receipt, index) => (
                  <article className="receipt" key={`${receipt.source_field}-${index}`}><div><FileCheck2 size={15} /><strong>{receipt.evidence_type}</strong><span>{receipt.source_field}</span></div><blockquote>“{receipt.quote}”</blockquote></article>
                ))}
              </div>
            </section>

            <section className="dossier-section">
              <div className="section-title"><h3>Known gaps</h3><span>Honest uncertainty</span></div>
              <ul className="gap-list">{detail.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
            </section>

            <section className="dossier-section">
              <div className="section-title"><h3>Source trail</h3><span>{detail.source_domain_count} domains</span></div>
              <div className="source-list">{detail.source_urls.slice(0, 5).map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}>{sourceHost(url)}<ArrowUpRight size={13} /></a>)}</div>
            </section>

            {detail.last_review && <div className="prior-review"><Check size={15} /><span>Last reviewed: <strong>{detail.last_review.decision}</strong> · {detail.last_review.note}</span></div>}
            <button className="review-cta" onClick={() => setReviewOpen(true)}><ShieldCheck size={17} /> Record a planner decision</button>
            {reviewOpen && <ReviewForm facilityId={detail.facility_id} capability={detail.capability} onCancel={() => setReviewOpen(false)} onSaved={() => { setReviewOpen(false); onReviewed(); }} />}
          </>
        )}
      </aside>
    </div>
  );
}

function ReviewForm({ facilityId, capability, onCancel, onSaved }: { facilityId: string; capability: string; onCancel: () => void; onSaved: () => void }) {
  const client = useQueryClient();
  const [decision, setDecision] = useState<ReviewDecision["decision"]>("VERIFY");
  const [overrideTier, setOverrideTier] = useState<TrustTier>("MODERATE");
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.review({ facility_id: facilityId, capability, decision, override_tier: decision === "OVERRIDE" ? overrideTier : null, note }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ["facility", facilityId] }); onSaved(); },
  });
  return (
    <div className="review-form">
      <div className="section-title"><h3>Planner decision</h3><button onClick={onCancel}><X size={16} /></button></div>
      <div className="decision-grid">
        {(["CONFIRM", "VERIFY", "OVERRIDE"] as const).map((item) => <button className={decision === item ? "selected" : ""} onClick={() => setDecision(item)} key={item}>{item === "CONFIRM" ? "Confirm assessment" : item === "VERIFY" ? "Field verification" : "Override tier"}</button>)}
      </div>
      {decision === "OVERRIDE" && <label><span>Override evidence tier</span><select value={overrideTier} onChange={(event) => setOverrideTier(event.target.value as TrustTier)}><option value="STRONG">Strong</option><option value="MODERATE">Moderate</option><option value="WEAK">Weak</option><option value="INSUFFICIENT">Insufficient</option></select></label>}
      <label><span>Decision note <b>required</b></span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you verify, and what should the next planner know?" /></label>
      {mutation.isError && <p className="form-error">The review store is unavailable. Your assessment was not saved.</p>}
      <div className="form-actions"><button onClick={onCancel}>Cancel</button><button className="primary" disabled={note.trim().length < 10 || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Saving…" : "Save decision"}</button></div>
    </div>
  );
}

function DataHealthView() {
  const health = useQuery({ queryKey: ["data-health"], queryFn: api.dataHealth });
  if (health.isLoading) return <main className="subpage"><SkeletonRows /></main>;
  if (!health.data) return <main className="subpage"><div className="empty-state"><AlertTriangle /><h3>Health profile unavailable</h3></div></main>;
  const data = health.data;
  return (
    <main className="subpage">
      <section className="subpage-title"><p className="eyebrow">Dataset health</p><h1>Know the blind spots before making the map.</h1><p>A live profile of claims, geography and evidence coverage across the shared catalog.</p></section>
      <section className="metrics-grid health-metrics"><Metric label="Facility records" value={data.total_records.toLocaleString()} /><Metric label="Canonical facilities" value={data.unique_facilities.toLocaleString()} /><Metric label="Raw state values" value={data.raw_state_values} tone="warning" /><Metric label="Coordinate conflicts" value={data.coordinate_conflicts.toLocaleString()} tone="review" /><Metric label="NFHS exact join" value={`${data.nfhs_join_rate}%`} /></section>
      <section className="health-layout">
        <article className="health-card"><div className="panel-heading"><div><p className="eyebrow">Completeness</p><h2>Not all fields carry equal weight</h2></div><Database size={19} /></div><div className="coverage-bars">{data.coverage.map((item) => <div key={item.field}><span>{item.field}</span><div><i style={{ width: `${item.value}%` }} /></div><b>{item.value}%</b></div>)}</div></article>
        <article className="health-card"><div className="panel-heading"><div><p className="eyebrow">Claim pressure</p><h2>Claims versus corroboration</h2></div><Hospital size={19} /></div><ResponsiveContainer width="100%" height={330}><BarChart data={data.capability_evidence} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}><CartesianGrid vertical={false} stroke="#dbe3df" /><XAxis dataKey="capability" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="claimed" fill="#b8c6c0" radius={[4, 4, 0, 0]} /><Bar dataKey="supported" fill="#176f68" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer><div className="chart-legend"><span><i className="claim" /> Claimed</span><span><i className="supported" /> Corroborated</span></div></article>
      </section>
    </main>
  );
}

function MethodologyView() {
  return (
    <main className="subpage methodology">
      <section className="subpage-title"><p className="eyebrow">Methodology</p><h1>A score that can show its work.</h1><p>CareProof ranks visible evidence—not hospital quality, accreditation, or current availability.</p></section>
      <section className="method-grid">
        <article><span>01</span><h2>Normalize</h2><p>Parse noisy arrays, canonicalize geography through India Post PIN data, and retain every raw field.</p></article>
        <article><span>02</span><h2>Extract</h2><p>Find capability-specific sentences, equipment, staff, procedures, capacity and independent source domains.</p></article>
        <article><span>03</span><h2>Challenge</h2><p>Flag directory context, cross-facility contamination, implausible numbers, contradictions and location mismatch.</p></article>
        <article><span>04</span><h2>Remember</h2><p>Persist planner decisions with the scoring version, reviewer identity, note and complete audit history.</p></article>
      </section>
      <section className="weight-card"><div><p className="eyebrow">Evidence model v1.0</p><h2>Transparent by construction</h2></div><div className="weight-list">{[["Direct facility statement",30],["Equipment",20],["Staff and specialty",20],["Capacity",10],["Procedures",10],["Source diversity",10]].map(([label,value]) => <div key={String(label)}><span>{label}</span><strong>{value} pts</strong></div>)}</div></section>
    </main>
  );
}

export default App;
