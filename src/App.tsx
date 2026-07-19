import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleOff,
  Compass,
  Database,
  FileCheck2,
  Flag,
  Hospital,
  Info,
  Layers3,
  ListFilter,
  LocateFixed,
  MapPin,
  MessageSquareText,
  Navigation,
  Play,
  Route,
  RefreshCw,
  ScanSearch,
  Search,
  Send,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Target,
  Workflow,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "./api";
import { DEMO_MODE, LIVE_APP_URL } from "./runtime";
import type {
  CapabilityBenchmark,
  EvidenceReceipt,
  FacilityDetail,
  FacilitySummary,
  MapPoint,
  NearestFacility,
  ResolvedLocation,
  ReviewDecision,
  Summary,
  TrustTier,
} from "./types";

type View = "landscape" | "access" | "review" | "health" | "methodology";

const FALLBACK_CAPABILITIES = [
  { code: "ICU", label: "ICU" },
  { code: "NICU", label: "NICU" },
  { code: "EMERGENCY", label: "Emergency" },
  { code: "MATERNITY", label: "Maternity" },
  { code: "ONCOLOGY", label: "Oncology" },
  { code: "TRAUMA", label: "Trauma" },
];

const TIER_LABEL: Record<TrustTier, string> = {
  STRONG: "Strong",
  MODERATE: "Moderate",
  WEAK: "Weak",
  INSUFFICIENT: "Insufficient",
  NEEDS_REVIEW: "Review",
};

const TIER_COLORS: Record<TrustTier, string> = {
  STRONG: "#14766e",
  MODERATE: "#356c86",
  WEAK: "#c27b20",
  INSUFFICIENT: "#9ba7a2",
  NEEDS_REVIEW: "#bd5147",
};

type MapMode = "evidence" | "location";

const LOCATION_LABELS: Record<string, string> = {
  VERIFIED: "PIN verified",
  PLAUSIBLE: "PIN plausible",
  PIN_FALLBACK: "PIN corrected",
  RAW_UNVERIFIED: "Raw only",
  UNKNOWN: "Unknown",
};

const LOCATION_COLORS: Record<string, string> = {
  VERIFIED: "#14766e",
  PLAUSIBLE: "#356c86",
  PIN_FALLBACK: "#c27b20",
  RAW_UNVERIFIED: "#bd5147",
  UNKNOWN: "#9ba7a2",
};

const geographyCollection = feature(
  world as never,
  (world as unknown as { objects: { countries: never } }).objects.countries,
) as unknown as { features: Array<{ id: string | number }> };
const INDIA_GEOGRAPHY = geographyCollection.features.find(
  (item) => String(item.id) === "356",
);

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source link";
  }
}

function TierBadge({ tier }: { tier: TrustTier }) {
  return (
    <span className={`tier tier--${tier.toLowerCase()}`}>
      {TIER_LABEL[tier]}
    </span>
  );
}

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ""}`}>
      <div>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="skeleton-list">
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="skeleton-row" key={item}>
          <i />
          <div>
            <b />
            <span />
          </div>
          <em />
        </div>
      ))}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function introWasDismissed() {
  try {
    return window.localStorage.getItem("careproof-intro-dismissed") === "1";
  } catch {
    return false;
  }
}

function App() {
  const [view, setView] = useState<View>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return (
      ["landscape", "access", "review", "health", "methodology"] as View[]
    ).includes(requested as View)
      ? (requested as View)
      : "landscape";
  });
  const [capability, setCapability] = useState("ICU");
  const [state, setState] = useState("ALL");
  const [tier, setTier] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("facility"),
  );
  const [demoOpen, setDemoOpen] = useState(
    () => new URLSearchParams(window.location.search).get("tour") === "1",
  );
  const [introVisible, setIntroVisible] = useState(() => !introWasDismissed());
  const [demoPlace, setDemoPlace] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("place"),
  );
  const debouncedQuery = useDebouncedValue(query, 350);

  const filters = useQuery({ queryKey: ["filters"], queryFn: api.filters });
  const summary = useQuery({
    queryKey: ["summary", capability, state],
    queryFn: () => api.summary(capability, state),
    enabled: view === "landscape" || view === "review",
  });
  const facilities = useQuery({
    queryKey: ["facilities", capability, state, tier, debouncedQuery],
    queryFn: () => api.facilities(capability, state, tier, debouncedQuery),
    enabled: view === "landscape" || view === "review",
  });
  const mapPoints = useQuery({
    queryKey: ["map-points", capability, state],
    queryFn: () => api.mapPoints(capability, state),
    enabled: view === "landscape" || view === "access",
  });
  const regions = useQuery({
    queryKey: ["regions", capability, state],
    queryFn: () => api.regions(capability, state),
    enabled: view === "landscape",
  });
  const benchmark = useQuery({
    queryKey: ["capability-benchmark", state],
    queryFn: () => api.capabilityBenchmark(state),
    enabled: view === "landscape",
  });
  const detail = useQuery({
    queryKey: ["facility", selectedId, capability],
    queryFn: () => api.detail(selectedId!, capability),
    enabled: Boolean(selectedId),
  });

  const capabilities = filters.data?.capabilities ?? FALLBACK_CAPABILITIES;
  const states = filters.data?.states ?? [];
  const coreError =
    filters.isError ||
    (view === "landscape" &&
      (summary.isError ||
        mapPoints.isError ||
        regions.isError ||
        benchmark.isError));

  const updateCapability = (next: string) => {
    setCapability(next);
    setSelectedId(null);
  };

  const navigate = (next: View) => {
    setView(next);
    setSelectedId(null);
    const url = new URL(window.location.href);
    if (next === "landscape") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.pushState({ view: next }, "", url);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  useEffect(() => {
    const onPopState = () => {
      const requested = new URLSearchParams(window.location.search).get("view");
      setView(
        (["access", "review", "health", "methodology"] as View[]).includes(
          requested as View,
        )
          ? (requested as View)
          : "landscape",
      );
      setSelectedId(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const dismissIntro = () => {
    setIntroVisible(false);
    try {
      window.localStorage.setItem("careproof-intro-dismissed", "1");
    } catch {
      /* private browsing */
    }
  };

  const runGuidedDemo = () => {
    dismissIntro();
    setDemoOpen(false);
    setCapability("ICU");
    setState("ALL");
    setDemoPlace("Jaipur");
    navigate("access");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate("landscape")}
          aria-label="CareProof home"
        >
          <span className="brand-mark">
            <ShieldCheck size={19} />
          </span>
          <span>
            <strong>CareProof</strong>
            <small>India</small>
          </span>
        </button>
        <nav aria-label="Primary navigation">
          <button
            className={view === "landscape" ? "active" : ""}
            onClick={() => navigate("landscape")}
          >
            Landscape
          </button>
          <button
            className={view === "access" ? "active" : ""}
            onClick={() => navigate("access")}
          >
            Access finder
          </button>
          <button
            className={view === "review" ? "active" : ""}
            onClick={() => navigate("review")}
          >
            Review queue
          </button>
          <button
            className={view === "health" ? "active" : ""}
            onClick={() => navigate("health")}
          >
            Data health
          </button>
          <button
            className={view === "methodology" ? "active" : ""}
            onClick={() => navigate("methodology")}
          >
            Method
          </button>
        </nav>
        <div className="topbar-actions">
          <button className="demo-button" onClick={() => setDemoOpen(true)}>
            <Play size={13} fill="currentColor" /> 60-sec demo
          </button>
          <div className="topbar-context">
            <span className="live-dot" />{" "}
            {DEMO_MODE ? "Judge demo" : "Live data"}
          </div>
        </div>
      </header>

      {DEMO_MODE && (
        <div className="public-demo-banner">
          <Info size={15} />
          <span>
            <strong>Anonymous judge demo.</strong> Read-only catalog snapshot;
            the full product runs on Databricks.
          </span>
          <a href={LIVE_APP_URL} target="_blank" rel="noreferrer">
            Open live workspace <ArrowUpRight size={13} />
          </a>
        </div>
      )}
      {introVisible && (
        <IntroRibbon
          onOpen={() => setDemoOpen(true)}
          onDismiss={dismissIntro}
        />
      )}
      {coreError && (
        <div className="service-banner" role="alert">
          <AlertTriangle size={15} />
          <span>One or more live catalog views did not load.</span>
          <button onClick={() => window.location.reload()}>
            Retry connection
          </button>
        </div>
      )}

      {view === "landscape" && (
        <LandscapeView
          capability={capability}
          state={state}
          capabilities={capabilities}
          states={states}
          summary={summary.data}
          facilities={facilities.data ?? []}
          points={mapPoints.data ?? []}
          benchmark={benchmark.data ?? []}
          regionRows={regions.data ?? []}
          loading={mapPoints.isLoading || summary.isLoading}
          onCapability={updateCapability}
          onState={(next) => {
            setState(next);
            setSelectedId(null);
          }}
          onSelect={setSelectedId}
          onOpenQueue={() => navigate("review")}
        />
      )}

      {view === "access" && (
        <AccessFinder
          capability={capability}
          state={state}
          capabilities={capabilities}
          states={states}
          points={mapPoints.data ?? []}
          initialPlace={demoPlace}
          onInitialPlaceUsed={() => setDemoPlace(null)}
          onCapability={updateCapability}
          onState={(next) => {
            setState(next);
            setSelectedId(null);
          }}
          onSelect={setSelectedId}
        />
      )}

      {view === "review" && (
        <ReviewQueue
          capability={capability}
          state={state}
          tier={tier}
          query={query}
          capabilities={capabilities}
          states={states}
          summary={summary.data}
          facilities={facilities.data ?? []}
          loading={facilities.isLoading}
          error={facilities.isError}
          onCapability={updateCapability}
          onState={(next) => {
            setState(next);
            setSelectedId(null);
          }}
          onTier={setTier}
          onQuery={setQuery}
          onSelect={setSelectedId}
          onRetry={() => facilities.refetch()}
        />
      )}

      {view === "health" && <DataHealthView />}
      {view === "methodology" && <MethodologyView />}

      {selectedId && (
        <DetailPanel
          detail={detail.data}
          loading={detail.isLoading}
          onClose={() => setSelectedId(null)}
          onReviewed={() => {
            detail.refetch();
            summary.refetch();
            facilities.refetch();
          }}
        />
      )}
      {demoOpen && (
        <JudgeGuide onClose={() => setDemoOpen(false)} onRun={runGuidedDemo} />
      )}
    </div>
  );
}

interface ControlProps {
  capability: string;
  state: string;
  capabilities: Array<{ code: string; label: string }>;
  states: string[];
  onCapability: (value: string) => void;
  onState: (value: string) => void;
}

function PlannerControls({
  capability,
  state,
  capabilities,
  states,
  onCapability,
  onState,
}: ControlProps) {
  return (
    <section className="control-rail" aria-label="Planner filters">
      <div className="capability-tabs">
        <span className="control-label">Capability</span>
        <div>
          {capabilities.map((item) => (
            <button
              key={item.code}
              className={capability === item.code ? "selected" : ""}
              onClick={() => onCapability(item.code)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <label className="select-control">
        <span>Geography</span>
        <select value={state} onChange={(event) => onState(event.target.value)}>
          <option value="ALL">All India</option>
          {states.map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function PageLead({
  eyebrow,
  title,
  badge,
}: {
  eyebrow: string;
  title: string;
  badge: string;
}) {
  return (
    <section className="page-lead">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="scope-badge">
        <Info size={15} />
        <span>{badge}</span>
      </div>
    </section>
  );
}

function IntroRibbon({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside className="intro-ribbon">
      <div>
        <Sparkles size={15} />
        <strong>New to CareProof?</strong>
        <span>
          Trace one planning decision from national gap to source receipt.
        </span>
      </div>
      <button onClick={onOpen}>
        Start the 60-sec tour <ArrowRight size={14} />
      </button>
      <button
        className="intro-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss introduction"
      >
        <X size={14} />
      </button>
    </aside>
  );
}

function JudgeGuide({
  onClose,
  onRun,
}: {
  onClose: () => void;
  onRun: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div
      className="guide-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="judge-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
      >
        <button
          className="guide-close"
          onClick={onClose}
          aria-label="Close guided tour"
        >
          <X size={18} />
        </button>
        <div className="guide-hero">
          <p className="eyebrow">Judge's 60-second path</p>
          <h2 id="guide-title">
            From 10,077 listings to one auditable action.
          </h2>
          <p>
            CareProof does not guess which hospital is “best.” It shows planners
            where claims are weak, what evidence exists, and what must be
            verified next.
          </p>
        </div>
        <div className="guide-flow">
          <article>
            <span>01</span>
            <div className="guide-icon">
              <Layers3 size={21} />
            </div>
            <h3>See the gap</h3>
            <p>
              Compare six capabilities and locate districts with the largest
              evidence deficit.
            </p>
          </article>
          <i>
            <ArrowRight size={18} />
          </i>
          <article>
            <span>02</span>
            <div className="guide-icon">
              <ScanSearch size={21} />
            </div>
            <h3>Test access</h3>
            <p>
              Search any city or PIN, then compare distance without hiding
              evidence quality.
            </p>
          </article>
          <i>
            <ArrowRight size={18} />
          </i>
          <article>
            <span>03</span>
            <div className="guide-icon">
              <FileCheck2 size={21} />
            </div>
            <h3>Open the proof</h3>
            <p>
              Inspect sentence receipts, known gaps, flags, and the persistent
              review trail.
            </p>
          </article>
        </div>
        <div className="guide-stats">
          <div>
            <strong>75,651</strong>
            <span>evidence receipts</span>
          </div>
          <div>
            <strong>26,174</strong>
            <span>capability profiles</span>
          </div>
          <div>
            <strong>6</strong>
            <span>care capabilities</span>
          </div>
        </div>
        <div className="guide-actions">
          <button onClick={onClose}>Explore myself</button>
          <button className="primary" onClick={onRun}>
            <Play size={14} fill="currentColor" /> Run the Jaipur scenario
          </button>
        </div>
      </section>
    </div>
  );
}

function LandscapeView({
  capability,
  state,
  capabilities,
  states,
  summary,
  facilities,
  points,
  benchmark,
  regionRows,
  loading,
  onCapability,
  onState,
  onSelect,
  onOpenQueue,
}: ControlProps & {
  summary?: Summary;
  facilities: FacilitySummary[];
  points: MapPoint[];
  benchmark: CapabilityBenchmark[];
  regionRows: Awaited<ReturnType<typeof api.regions>>;
  loading: boolean;
  onSelect: (id: string) => void;
  onOpenQueue: () => void;
}) {
  const priority = facilities.slice(0, 5);
  return (
    <main className="dashboard-page">
      <PageLead
        eyebrow="National planning landscape"
        title="See where the evidence holds—and where it breaks."
        badge="Planner intelligence · not patient referral advice"
      />
      <PlannerControls
        {...{ capability, state, capabilities, states, onCapability, onState }}
      />
      <section className="metrics-grid metrics-grid--four">
        <Metric
          label="Assessed"
          value={summary?.total?.toLocaleString() ?? "—"}
          hint={DEMO_MODE && state !== "ALL" ? "mapped snapshot sample" : `${capability} profiles`}
        />
        <Metric
          label="Strong evidence"
          value={summary?.strong ?? "—"}
          tone="strong"
          hint="defensible first look"
        />
        <Metric
          label="Needs review"
          value={summary?.needs_review ?? "—"}
          tone="review"
          hint="human attention"
        />
        <Metric
          label="Location issues"
          value={summary?.location_issues ?? "—"}
          tone="warning"
          hint="corrected or unknown"
        />
      </section>

      <section className="landscape-grid">
        <article className="map-card">
          <CardHeading
            eyebrow="Geographic signal"
            title={`${capability} evidence across ${state === "ALL" ? "India" : state}`}
            icon={<Layers3 size={18} />}
            aside={`${points.length.toLocaleString()} mapped sample`}
          />
          <IndiaSignalMap
            points={points}
            loading={loading}
            onSelect={onSelect}
            showLens
          />
        </article>
        <div className="insight-stack">
          <EvidenceDonut summary={summary} capability={capability} />
          <PriorityDistricts rows={regionRows} />
        </div>
      </section>

      <CapabilityBenchmarkView
        rows={benchmark}
        active={capability}
        onSelect={onCapability}
      />

      <section className="priority-strip">
        <div className="priority-heading">
          <div>
            <p className="eyebrow">Evidence leaders</p>
            <h2>Facilities worth inspecting first</h2>
          </div>
          <button onClick={onOpenQueue}>
            Open full queue <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="facility-card-grid">
          {priority.map((facility, index) => (
            <FacilityCard
              facility={facility}
              rank={index + 1}
              key={facility.facility_id}
              onSelect={() => onSelect(facility.facility_id)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function CapabilityBenchmarkView({
  rows,
  active,
  onSelect,
}: {
  rows: CapabilityBenchmark[];
  active: string;
  onSelect: (capability: string) => void;
}) {
  return (
    <section className="benchmark-card">
      <div className="benchmark-heading">
        <div>
          <p className="eyebrow">Capability benchmark</p>
          <h2>Where evidence is decision-ready</h2>
        </div>
        <p>
          <Workflow size={14} /> Strong + moderate profiles, compared
          consistently
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="benchmark-skeleton">
          {FALLBACK_CAPABILITIES.map((item) => (
            <i key={item.code} />
          ))}
        </div>
      ) : (
        <div className="benchmark-grid">
          {rows.map((row) => (
            <button
              key={row.capability}
              className={active === row.capability ? "active" : ""}
              onClick={() => onSelect(row.capability)}
            >
              <div>
                <strong>{row.capability}</strong>
                <span>{row.defensible_share}%</span>
              </div>
              <div className="benchmark-track">
                <i style={{ width: `${row.defensible_share}%` }} />
              </div>
              <small>
                {row.defensible.toLocaleString()} defensible ·{" "}
                {row.evidence_gap.toLocaleString()} gaps
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CardHeading({
  eyebrow,
  title,
  icon,
  aside,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  aside?: string;
}) {
  return (
    <div className="card-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="card-heading-aside">
        {aside && <span>{aside}</span>}
        {icon}
      </div>
    </div>
  );
}

function IndiaSignalMap({
  points,
  loading,
  onSelect,
  origin,
  highlighted = [],
  showLens = false,
  scenario,
}: {
  points: MapPoint[];
  loading?: boolean;
  onSelect: (id: string) => void;
  origin?: ResolvedLocation | null;
  highlighted?: string[];
  showLens?: boolean;
  scenario?: {
    primary?: NearestFacility | null;
    fallback?: NearestFacility | null;
    outage: boolean;
  };
}) {
  const projection = useMemo(
    () => geoMercator().center([82, 22]).scale(790).translate([400, 255]),
    [],
  );
  const outline = INDIA_GEOGRAPHY
    ? geoPath(projection)(INDIA_GEOGRAPHY as never)
    : null;
  const highlightedIds = useMemo(() => new Set(highlighted), [highlighted]);
  const [mode, setMode] = useState<MapMode>(() =>
    showLens &&
    new URLSearchParams(window.location.search).get("map") === "location"
      ? "location"
      : "evidence",
  );
  const locationLegend = [
    "VERIFIED",
    "PLAUSIBLE",
    "PIN_FALLBACK",
    "RAW_UNVERIFIED",
  ];
  const routeTarget = scenario?.outage ? scenario.fallback : scenario?.primary;
  const routeCoordinates =
    origin && routeTarget?.longitude != null && routeTarget.latitude != null
      ? [
          projection([origin.longitude, origin.latitude]),
          projection([routeTarget.longitude, routeTarget.latitude]),
        ]
      : null;
  return (
    <div className="map-stage">
      {loading && (
        <div className="map-loading">
          <span />
          <p>Mapping corrected coordinates…</p>
        </div>
      )}
      {showLens && (
        <div className="map-lens" aria-label="Map lens">
          <span>Lens</span>
          <button
            aria-pressed={mode === "evidence"}
            onClick={() => setMode("evidence")}
          >
            Evidence
          </button>
          <button
            aria-pressed={mode === "location"}
            onClick={() => setMode("location")}
          >
            Location confidence
          </button>
        </div>
      )}
      <svg
        viewBox="0 0 800 520"
        role="img"
        aria-label={`India map showing facility ${mode === "evidence" ? "evidence strength" : "coordinate confidence"}`}
      >
        <defs>
          <radialGradient id="mapGlow">
            <stop offset="0" stopColor="#d9ebe5" stopOpacity=".9" />
            <stop offset="1" stopColor="#eef3ef" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="400" cy="255" r="310" fill="url(#mapGlow)" />
        {outline && <path d={outline} className="india-outline" />}
        {routeCoordinates?.[0] && routeCoordinates?.[1] && (
          <line
            className={`access-route-line ${scenario?.outage ? "is-outage" : ""}`}
            x1={routeCoordinates[0][0]}
            y1={routeCoordinates[0][1]}
            x2={routeCoordinates[1][0]}
            y2={routeCoordinates[1][1]}
          />
        )}
        {points.map((point) => {
          const projected = projection([point.longitude, point.latitude]);
          if (!projected) return null;
          const highlightedPoint = highlightedIds.has(point.facility_id);
          const locationLabel =
            LOCATION_LABELS[point.location_confidence] ?? "Unknown";
          const simulatedOutage =
            scenario?.outage &&
            point.facility_id === scenario.primary?.facility_id;
          return (
            <circle
              key={point.facility_id}
              cx={projected[0]}
              cy={projected[1]}
              r={highlightedPoint ? 6 : point.tier === "STRONG" ? 3.6 : 2.5}
              fill={
                simulatedOutage
                  ? TIER_COLORS.NEEDS_REVIEW
                  : mode === "location"
                    ? (LOCATION_COLORS[point.location_confidence] ??
                      LOCATION_COLORS.UNKNOWN)
                    : TIER_COLORS[point.tier]
              }
              fillOpacity={simulatedOutage ? 0.32 : highlightedPoint ? 1 : 0.76}
              stroke={highlightedPoint ? "#fff" : "none"}
              strokeWidth={highlightedPoint ? 2.2 : 0}
              className={`map-point ${simulatedOutage ? "map-point--outage" : ""}`}
              onClick={() => onSelect(point.facility_id)}
            >
              <title>
                {point.name} ·{" "}
                {simulatedOutage
                  ? "simulated unavailable"
                  : mode === "location"
                    ? locationLabel
                    : `${point.evidence_strength}/100 · ${TIER_LABEL[point.tier]}`}
              </title>
            </circle>
          );
        })}
        {origin &&
          (() => {
            const projected = projection([origin.longitude, origin.latitude]);
            return projected ? (
              <g className="origin-marker">
                <circle cx={projected[0]} cy={projected[1]} r="13" />
                <circle cx={projected[0]} cy={projected[1]} r="5" />
              </g>
            ) : null;
          })()}
      </svg>
      <div className="map-legend">
        {mode === "evidence"
          ? (
              [
                "STRONG",
                "MODERATE",
                "WEAK",
                "NEEDS_REVIEW",
                "INSUFFICIENT",
              ] as TrustTier[]
            ).map((item) => (
              <span key={item}>
                <i style={{ background: TIER_COLORS[item] }} />
                {TIER_LABEL[item]}
              </span>
            ))
          : locationLegend.map((item) => (
              <span key={item}>
                <i style={{ background: LOCATION_COLORS[item] }} />
                {LOCATION_LABELS[item]}
              </span>
            ))}
      </div>
      <p className="map-footnote">
        <Target size={13} />{" "}
        {mode === "location"
          ? "Coordinate confidence is separate from care availability and capability evidence."
          : "PIN-conflicting coordinates use the PIN centroid; unknown locations are excluded."}
      </p>
    </div>
  );
}

function EvidenceDonut({
  summary,
  capability,
}: {
  summary?: Summary;
  capability: string;
}) {
  const data = summary
    ? [
        { name: "Strong", value: summary.strong, color: TIER_COLORS.STRONG },
        {
          name: "Moderate",
          value: summary.moderate,
          color: TIER_COLORS.MODERATE,
        },
        { name: "Weak", value: summary.weak, color: TIER_COLORS.WEAK },
        {
          name: "Review",
          value: summary.needs_review,
          color: TIER_COLORS.NEEDS_REVIEW,
        },
        {
          name: "Insufficient",
          value: summary.insufficient,
          color: TIER_COLORS.INSUFFICIENT,
        },
      ]
    : [];
  const defensible = summary?.total
    ? Math.round(((summary.strong + summary.moderate) / summary.total) * 100)
    : 0;
  return (
    <article className="insight-card donut-card">
      <CardHeading
        eyebrow="Evidence mix"
        title={`${capability} confidence`}
        icon={<BarChart3 size={18} />}
      />
      <div className="donut-wrap">
        <ResponsiveContainer width="100%" height={188}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={58}
              outerRadius={78}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{defensible}%</strong>
          <span>strong + moderate</span>
        </div>
      </div>
      <div className="donut-ledger">
        {data.map((item) => (
          <div key={item.name}>
            <i style={{ background: item.color }} />
            <span>{item.name}</span>
            <b>{item.value}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function PriorityDistricts({
  rows,
}: {
  rows: Awaited<ReturnType<typeof api.regions>>;
}) {
  const data = rows.slice(0, 6).map((row) => ({
    ...row,
    label: `${row.district}${row.state ? ` · ${row.state}` : ""}`,
  }));
  return (
    <article className="insight-card district-card">
      <CardHeading
        eyebrow="Priority districts"
        title="Uncorroborated profiles"
        icon={<Route size={18} />}
      />
      {data.length === 0 ? (
        <p className="card-empty">
          No district aggregation is available for this selection.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={224}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 34, left: 12, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} stroke="#e1e7e3" />
            <XAxis type="number" hide />
            <YAxis
              dataKey="label"
              type="category"
              width={115}
              tick={{ fontSize: 9, fill: "#566762" }}
            />
            <Tooltip formatter={(value) => [value, "Weak / uncorroborated"]} />
            <Bar
              dataKey="evidence_gap"
              fill="#c27b20"
              radius={[0, 5, 5, 0]}
              label={{ position: "right", fontSize: 9, fill: "#53635e" }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </article>
  );
}

function FacilityCard({
  facility,
  rank,
  onSelect,
}: {
  facility: FacilitySummary;
  rank: number;
  onSelect: () => void;
}) {
  return (
    <button className="facility-card" onClick={onSelect}>
      <div className="facility-card-top">
        <span>{String(rank).padStart(2, "0")}</span>
        <TierBadge tier={facility.tier} />
      </div>
      <h3>{facility.name}</h3>
      <p>
        <MapPin size={12} />
        {[facility.city, facility.state].filter(Boolean).join(", ")}
      </p>
      <div className="facility-card-score">
        <strong>{facility.evidence_strength}</strong>
        <span>/100</span>
        <small>
          {facility.facet_count} facets · {facility.source_domain_count} domains
        </small>
      </div>
    </button>
  );
}

function ResilienceSimulator({
  origin,
  capability,
  facilities,
  radius,
  outage,
  onRadius,
  onOutage,
  onInspect,
}: {
  origin: ResolvedLocation;
  capability: string;
  facilities: NearestFacility[];
  radius: number;
  outage: boolean;
  onRadius: (radius: number) => void;
  onOutage: (outage: boolean) => void;
  onInspect: (id: string) => void;
}) {
  const withinRadius = facilities.filter((item) => item.distance_km <= radius);
  const defensible = withinRadius.filter(
    (item) => item.tier === "STRONG" || item.tier === "MODERATE",
  );
  const primary = defensible[0] ?? null;
  const fallback =
    facilities.find(
      (item) =>
        item.facility_id !== primary?.facility_id &&
        (item.tier === "STRONG" || item.tier === "MODERATE"),
    ) ?? null;
  const remainingInRadius = outage
    ? defensible.filter((item) => item.facility_id !== primary?.facility_id)
        .length
    : defensible.length;
  const candidate =
    withinRadius
      .filter((item) => item.tier === "WEAK" || item.tier === "NEEDS_REVIEW")
      .sort(
        (left, right) =>
          right.evidence_strength - left.evidence_strength ||
          left.distance_km - right.distance_km,
      )[0] ?? null;
  const status = outage
    ? remainingInRadius >= 2
      ? "Resilience retained"
      : remainingInRadius === 1
        ? "One fallback remains"
        : "Catchment exposed"
    : defensible.length >= 3
      ? "Resilient catchment"
      : defensible.length === 2
        ? "Limited redundancy"
        : defensible.length === 1
          ? "Single-point exposure"
          : "No defensible option";
  const fallbackDelta =
    primary && fallback
      ? Math.max(
          0,
          Number((fallback.distance_km - primary.distance_km).toFixed(1)),
        )
      : null;

  return (
    <section
      className={`resilience-card ${outage ? "is-outage" : ""}`}
      aria-label={`${capability} catchment resilience scenario`}
    >
      <div className="resilience-heading">
        <div>
          <p className="eyebrow">Evidence resilience simulator</p>
          <h2>
            What if the nearest defensible {capability} claim cannot be used?
          </h2>
        </div>
        <div className="radius-control" aria-label="Catchment radius">
          {[10, 25, 50].map((value) => (
            <button
              key={value}
              aria-pressed={radius === value}
              onClick={() => onRadius(value)}
            >
              {value} km
            </button>
          ))}
        </div>
      </div>
      <div className="resilience-path">
        <article>
          <span>Origin</span>
          <strong>{origin.label}</strong>
          <small>
            {withinRadius.length} mapped claims within {radius} km
          </small>
        </article>
        <ArrowRight size={16} />
        <article className={outage ? "is-disabled" : ""}>
          <span>Nearest defensible</span>
          <strong>{primary?.name ?? "None found"}</strong>
          <small>
            {primary
              ? `${primary.distance_km} km · ${TIER_LABEL[primary.tier]}`
              : "No strong or moderate evidence"}
          </small>
          {outage && (
            <i>
              <CircleOff size={12} /> Simulated unavailable
            </i>
          )}
        </article>
        <ArrowRight size={16} />
        <article className={outage && fallback ? "is-active" : ""}>
          <span>Fallback</span>
          <strong>{fallback?.name ?? "No defensible fallback"}</strong>
          <small>
            {fallback
              ? `${fallback.distance_km} km · ${fallback.distance_km <= radius ? "inside" : "outside"} catchment`
              : "Field verification is required"}
          </small>
        </article>
      </div>
      <aside className="resilience-verdict">
        <span
          className={`resilience-status resilience-status--${remainingInRadius === 0 ? "risk" : remainingInRadius === 1 ? "limited" : "ready"}`}
        >
          <ShieldAlert size={14} />
          {status}
        </span>
        <strong>{remainingInRadius}</strong>
        <p>
          defensible option{remainingInRadius === 1 ? "" : "s"}{" "}
          {outage ? "remain" : "found"} within {radius} km
        </p>
        {outage && fallbackDelta != null && (
          <small>Fallback adds {fallbackDelta} km</small>
        )}
        <button
          className="scenario-button"
          disabled={!primary}
          onClick={() => onOutage(!outage)}
        >
          {outage ? (
            <>
              <RefreshCw size={14} /> Reset scenario
            </>
          ) : (
            <>
              <CircleOff size={14} /> Simulate outage
            </>
          )}
        </button>
        {candidate && (
          <button
            className="candidate-button"
            onClick={() => onInspect(candidate.facility_id)}
          >
            Inspect next verification target <ArrowRight size={13} />
          </button>
        )}
      </aside>
      <p className="resilience-note">
        Planning scenario only. It models evidenced alternatives—not live beds,
        staffing, or admission probability.
      </p>
    </section>
  );
}

function AccessFinder({
  capability,
  state,
  capabilities,
  states,
  points,
  initialPlace,
  onInitialPlaceUsed,
  onCapability,
  onState,
  onSelect,
}: ControlProps & {
  points: MapPoint[];
  initialPlace?: string | null;
  onInitialPlaceUsed: () => void;
  onSelect: (id: string) => void;
}) {
  const [locationQuery, setLocationQuery] = useState("");
  const [origin, setOrigin] = useState<ResolvedLocation | null>(null);
  const [locationError, setLocationError] = useState("");
  const [radius, setRadius] = useState(25);
  const [outage, setOutage] = useState(
    () => new URLSearchParams(window.location.search).get("outage") === "1",
  );
  const handledInitial = useRef<string | null>(null);
  const resolver = useMutation({
    mutationFn: api.resolveLocation,
    onSuccess: (location) => {
      setOrigin(location);
      setLocationError("");
      if (location.state) onState(location.state);
    },
    onError: () =>
      setLocationError("No mapped PIN, city or district matched that search."),
  });
  const nearest = useQuery({
    queryKey: ["nearest", capability, origin?.latitude, origin?.longitude],
    queryFn: () => api.nearest(capability, origin!.latitude, origin!.longitude),
    enabled: Boolean(origin),
  });
  useEffect(() => {
    if (initialPlace && handledInitial.current !== initialPlace) {
      handledInitial.current = initialPlace;
      setLocationQuery(initialPlace);
      resolver.mutate(initialPlace);
      onInitialPlaceUsed();
    }
  }, [initialPlace, onInitialPlaceUsed, resolver]);
  const nearestPoints = useMemo(
    () =>
      (nearest.data ?? [])
        .slice(0, 20)
        .filter((item) => item.latitude != null && item.longitude != null),
    [nearest.data],
  );
  const bestEvidencedNearby = useMemo(
    () =>
      (nearest.data ?? [])
        .filter(
          (item) =>
            item.distance_km <= 25 &&
            (item.tier === "STRONG" || item.tier === "MODERATE"),
        )
        .sort(
          (left, right) =>
            right.evidence_strength - left.evidence_strength ||
            left.distance_km - right.distance_km,
        )[0]?.facility_id ?? null,
    [nearest.data],
  );
  const mapData = useMemo(() => {
    const merged = new Map(points.map((item) => [item.facility_id, item]));
    nearestPoints.forEach((item) =>
      merged.set(item.facility_id, item as MapPoint),
    );
    return [...merged.values()];
  }, [points, nearestPoints]);
  const defensibleWithinRadius = useMemo(
    () =>
      (nearest.data ?? []).filter(
        (item) =>
          item.distance_km <= radius &&
          (item.tier === "STRONG" || item.tier === "MODERATE"),
      ),
    [nearest.data, radius],
  );
  const scenarioPrimary = defensibleWithinRadius[0] ?? null;
  const scenarioFallback = useMemo(
    () =>
      (nearest.data ?? []).find(
        (item) =>
          item.facility_id !== scenarioPrimary?.facility_id &&
          (item.tier === "STRONG" || item.tier === "MODERATE"),
      ) ?? null,
    [nearest.data, scenarioPrimary],
  );

  useEffect(() => {
    setOutage(
      new URLSearchParams(window.location.search).get("outage") === "1",
    );
  }, [capability, origin?.latitude, origin?.longitude]);

  const updateOutage = (next: boolean) => {
    setOutage(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("outage", "1");
    else url.searchParams.delete("outage");
    window.history.replaceState(window.history.state, "", url);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("This browser does not expose geolocation.");
      return;
    }
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setOrigin({
          label: "Current location",
          state: null,
          district: null,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          matched_facilities: 0,
        }),
      () =>
        setLocationError(
          "Location permission was denied. Search by city or PIN instead.",
        ),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const resolvePlace = (place: string) => {
    setLocationQuery(place);
    resolver.mutate(place);
  };

  return (
    <main className="dashboard-page">
      <PageLead
        eyebrow="Geographic access finder"
        title={`Find the nearest evidenced ${capability} claims.`}
        badge="Distance + evidence · no live availability"
      />
      <PlannerControls
        {...{ capability, state, capabilities, states, onCapability, onState }}
      />
      <section className="locator-card">
        <div>
          <p className="eyebrow">Set an origin</p>
          <h2>City, district or 6-digit PIN</h2>
        </div>
        <div className="locator-input">
          <Search size={17} />
          <input
            value={locationQuery}
            onChange={(event) => setLocationQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && locationQuery.trim().length >= 2)
                resolver.mutate(locationQuery.trim());
            }}
            placeholder="Try Jaipur or 302001"
            aria-label="City, district or PIN"
          />
          <button
            disabled={locationQuery.trim().length < 2 || resolver.isPending}
            onClick={() => resolver.mutate(locationQuery.trim())}
          >
            {resolver.isPending ? "Locating…" : "Find"}
          </button>
        </div>
        <button
          className="location-button"
          onClick={useMyLocation}
          disabled={DEMO_MODE}
        >
          <LocateFixed size={16} />{" "}
          {DEMO_MODE ? "Live workspace only" : "Use my location"}
        </button>
        <div className="location-presets">
          <span>Quick scenarios</span>
          {["Jaipur", "Pune", "Lucknow"].map((place) => (
            <button
              key={place}
              onClick={() => resolvePlace(place)}
              disabled={resolver.isPending}
            >
              {place}
            </button>
          ))}
        </div>
        {origin && (
          <div className="origin-chip">
            <Navigation size={14} />
            <span>
              <strong>{origin.label}</strong>
              {[origin.district, origin.state].filter(Boolean).join(", ") &&
                ` · ${[origin.district, origin.state].filter(Boolean).join(", ")}`}
            </span>
          </div>
        )}
        {locationError && <p className="locator-error">{locationError}</p>}
      </section>
      {origin && !nearest.isLoading && nearest.data && (
        <ResilienceSimulator
          origin={origin}
          capability={capability}
          facilities={nearest.data}
          radius={radius}
          outage={outage}
          onRadius={setRadius}
          onOutage={updateOutage}
          onInspect={onSelect}
        />
      )}
      <section className="access-grid">
        <article className="map-card access-map">
          <CardHeading
            eyebrow="Access radius"
            title={
              origin
                ? `From ${origin.label}`
                : "Choose an origin to rank distance"
            }
            icon={<Compass size={18} />}
            aside={`${nearestPoints.length} nearest mapped`}
          />
          <IndiaSignalMap
            points={mapData}
            origin={origin}
            highlighted={[
              scenarioPrimary?.facility_id,
              scenarioFallback?.facility_id,
            ].filter((item): item is string => Boolean(item))}
            scenario={{
              primary: scenarioPrimary,
              fallback: scenarioFallback,
              outage,
            }}
            onSelect={onSelect}
          />
        </article>
        <article className="nearest-panel">
          <CardHeading
            eyebrow="Nearest claims"
            title={`${capability} facilities`}
            icon={<Navigation size={18} />}
          />
          {!origin ? (
            <div className="nearest-empty">
              <MapPin size={25} />
              <h3>Start with a place</h3>
              <p>
                We rank corrected coordinates by distance, then show the
                evidence tier beside each result.
              </p>
            </div>
          ) : nearest.isLoading ? (
            <SkeletonRows />
          ) : (
            <div className="nearest-list">
              {nearest.data?.slice(0, 8).map((facility, index) => (
                <NearestRow
                  facility={facility}
                  rank={index + 1}
                  tag={
                    facility.facility_id === bestEvidencedNearby
                      ? "Best evidence ≤25 km"
                      : index === 0
                        ? "Nearest"
                        : undefined
                  }
                  key={facility.facility_id}
                  onSelect={() => onSelect(facility.facility_id)}
                />
              ))}
            </div>
          )}
          <div className="access-warning">
            <AlertTriangle size={15} />
            <span>
              Nearest does not mean clinically suitable or currently available.
              Verify before programme referral.
            </span>
          </div>
        </article>
      </section>
    </main>
  );
}

function NearestRow({
  facility,
  rank,
  tag,
  onSelect,
}: {
  facility: NearestFacility;
  rank: number;
  tag?: string;
  onSelect: () => void;
}) {
  return (
    <button className="nearest-row" onClick={onSelect}>
      <span className="nearest-rank">{rank}</span>
      <div>
        {tag && <span className="nearest-tag">{tag}</span>}
        <strong>{facility.name}</strong>
        <p>{[facility.city, facility.state].filter(Boolean).join(", ")}</p>
        <TierBadge tier={facility.tier} />
      </div>
      <div className="nearest-distance">
        <strong>{facility.distance_km}</strong>
        <span>km</span>
        <small>{facility.evidence_strength}/100</small>
      </div>
      <ChevronRight size={16} />
    </button>
  );
}

function ReviewQueue({
  capability,
  state,
  tier,
  query,
  capabilities,
  states,
  summary,
  facilities,
  loading,
  error,
  onCapability,
  onState,
  onTier,
  onQuery,
  onSelect,
  onRetry,
}: ControlProps & {
  tier: string;
  query: string;
  summary?: Summary;
  facilities: FacilitySummary[];
  loading: boolean;
  error: boolean;
  onTier: (value: string) => void;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <main className="dashboard-page review-page">
      <PageLead
        eyebrow="Evidence review queue"
        title="Open the record only when the signal needs scrutiny."
        badge="Sentence receipts + persistent planner decisions"
      />
      <PlannerControls
        {...{ capability, state, capabilities, states, onCapability, onState }}
      />
      <section className="queue-summary">
        <Metric label="Strong" value={summary?.strong ?? "—"} tone="strong" />
        <Metric
          label="Needs review"
          value={summary?.needs_review ?? "—"}
          tone="review"
        />
        <Metric label="Human-reviewed" value={summary?.reviewed ?? 0} />
      </section>
      <section className="results-panel">
        <div className="queue-toolbar">
          <div>
            <p className="eyebrow">Ranked facilities</p>
            <h2>
              {capability} evidence · {state === "ALL" ? "India" : state}
            </h2>
          </div>
          <div className="queue-filters">
            <label>
              <ListFilter size={15} />
              <select
                value={tier}
                onChange={(event) => onTier(event.target.value)}
              >
                <option value="ALL">All tiers</option>
                <option value="STRONG">Strong</option>
                <option value="MODERATE">Moderate</option>
                <option value="WEAK">Weak</option>
                <option value="INSUFFICIENT">Insufficient</option>
                <option value="NEEDS_REVIEW">Needs review</option>
              </select>
            </label>
            <label>
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder="Name, city or district"
              />
            </label>
          </div>
        </div>
        <div className="table-head">
          <span>Facility</span>
          <span>Evidence</span>
          <span>Signals</span>
          <span />
        </div>
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <div className="empty-state">
            <AlertTriangle />
            <h3>Data service is warming up</h3>
            <button onClick={onRetry}>Retry</button>
          </div>
        ) : facilities.length === 0 ? (
          <div className="empty-state">
            <ListFilter />
            <h3>No facilities match these filters</h3>
          </div>
        ) : (
          <div className="facility-list">
            {facilities.map((facility, index) => (
              <FacilityRow
                key={facility.facility_id}
                facility={facility}
                rank={index + 1}
                onSelect={() => onSelect(facility.facility_id)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function FacilityRow({
  facility,
  rank,
  onSelect,
}: {
  facility: FacilitySummary;
  rank: number;
  onSelect: () => void;
}) {
  return (
    <button className="facility-row" onClick={onSelect}>
      <div className="facility-main">
        <span className="rank">{String(rank).padStart(2, "0")}</span>
        <div>
          <strong>{facility.name}</strong>
          <span>
            <MapPin size={13} />
            {[facility.city, facility.district, facility.state]
              .filter(Boolean)
              .join(", ")}
          </span>
        </div>
      </div>
      <div className="facility-evidence">
        <TierBadge tier={facility.tier} />
        <b>{facility.evidence_strength}</b>
        <small>/100</small>
      </div>
      <div className="facility-signals">
        <span>{facility.facet_count} facets</span>
        <span>{facility.source_domain_count} domains</span>
        {facility.flags.length > 0 && (
          <span className="flag-count">
            <Flag size={12} />
            {facility.flags.length}
          </span>
        )}
      </div>
      <ChevronRight size={17} />
    </button>
  );
}

type CopilotAnswer = {
  text: string;
  receipts: EvidenceReceipt[];
};

const COPILOT_PROMPTS = [
  "Why this evidence tier?",
  "What should be verified next?",
  "Can I trust this location?",
  "Is this suitable for patient referral?",
];

function copilotAnswer(detail: FacilityDetail, question: string): CopilotAnswer {
  const normalized = question.toLowerCase();
  const receipts = detail.evidence.slice(0, 2);
  if (/patient|referral|treatment|admission|best hospital|clinical/.test(normalized)) {
    return {
      text: `No. This dossier measures visible ${detail.capability} evidence, not clinical suitability, live availability, or admission probability. A planner must verify those conditions directly before any referral decision.`,
      receipts: [],
    };
  }
  if (/location|coordinate|map|pin|where/.test(normalized)) {
    const locationLabel = LOCATION_LABELS[detail.location_confidence] ?? "Unknown";
    const locationFlags = detail.flags.filter((flag) => /LOCATION|COORDINATE|PIN/.test(flag));
    return {
      text: `The location is classified as “${locationLabel}.” ${locationFlags.length ? `The record also carries ${locationFlags.length} location flag${locationFlags.length === 1 ? "" : "s"}: ${locationFlags.map((flag) => flag.replaceAll("_", " ").toLowerCase()).join(", ")}.` : "No location-specific quality flag is attached."}`,
      receipts: [],
    };
  }
  if (/gap|missing|verify|next|uncertain/.test(normalized)) {
    return {
      text: detail.gaps.length
        ? `Verify these first: ${detail.gaps.slice(0, 3).join("; ")}. A field decision should record what was checked and whether the evidence tier needs an override.`
        : "No explicit evidence gap is recorded, but live capability and availability still require direct verification.",
      receipts,
    };
  }
  if (/capacity|bed|beds/.test(normalized)) {
    return {
      text:
        detail.capacity != null
          ? `The source dataset reports general capacity of ${detail.capacity}, but it does not establish live ${detail.capability} beds, occupancy, staffing, or acceptance status.`
          : `No usable capacity value is present. The dossier cannot infer live ${detail.capability} bed availability.`,
      receipts: detail.evidence.filter((item) => /capacity|bed/i.test(`${item.evidence_type} ${item.quote}`)).slice(0, 2),
    };
  }
  if (/source|receipt|citation|proof/.test(normalized)) {
    return {
      text: `This profile uses ${detail.evidence.length} visible evidence receipt${detail.evidence.length === 1 ? "" : "s"} across ${detail.source_domain_count} source domain${detail.source_domain_count === 1 ? "" : "s"}. Open the receipts and source trail before treating the claim as verified.`,
      receipts,
    };
  }
  if (/why|tier|score|confidence|evidence|rated/.test(normalized)) {
    const components = [
      ["direct statement", detail.component_direct],
      ["equipment", detail.component_equipment],
      ["staff and specialty", detail.component_staff],
      ["capacity", detail.component_capacity],
      ["procedures", detail.component_procedure],
      ["source diversity", detail.component_sources],
    ]
      .filter(([, value]) => Number(value) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .map(([label]) => label);
    return {
      text: `${detail.name} is ${TIER_LABEL[detail.tier].toLowerCase()} at ${detail.evidence_strength}/100. The strongest visible signals are ${components.slice(0, 3).join(", ") || "not sufficiently present"}; the tier also requires enough independent evidence facets, not just a self-reported claim.`,
      receipts,
    };
  }
  return {
    text: "I can answer grounded questions about this facility’s score, receipts, missing evidence, coordinate confidence, capacity limitations, or planning use. I will not provide clinical advice.",
    receipts: [],
  };
}

function EvidenceCopilot({ detail }: { detail: FacilityDetail }) {
  const initialQuestion = new URLSearchParams(window.location.search).get("ask") ?? "";
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState(initialQuestion);
  const [answer, setAnswer] = useState<CopilotAnswer | null>(() =>
    initialQuestion ? copilotAnswer(detail, initialQuestion) : null,
  );

  const ask = (nextQuestion: string) => {
    const clean = nextQuestion.trim();
    if (!clean) return;
    setAsked(clean);
    setAnswer(copilotAnswer(detail, clean));
    setQuestion("");
  };

  return (
    <section className="dossier-section copilot-section">
      <div className="section-title">
        <h3>Evidence Copilot</h3>
        <span>Free · dossier-grounded</span>
      </div>
      <div className="copilot-grounding">
        <MessageSquareText size={15} /> Answers only from this profile’s receipts,
        flags, and scoring fields.
      </div>
      <div className="copilot-prompts">
        {COPILOT_PROMPTS.map((prompt) => (
          <button key={prompt} onClick={() => ask(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      {answer && (
        <div className="copilot-exchange" aria-live="polite">
          <p className="copilot-question">{asked}</p>
          <div className="copilot-answer">
            <Sparkles size={15} />
            <p>{answer.text}</p>
          </div>
          {answer.receipts.length > 0 && (
            <div className="copilot-citations">
              {answer.receipts.map((receipt, index) => (
                <article key={`${receipt.source_field}-${index}`}>
                  <span>{receipt.source_field}</span>
                  <p>“{receipt.quote.slice(0, 180)}{receipt.quote.length > 180 ? "…" : ""}”</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      <form
        className="copilot-input"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about evidence, gaps, location, or capacity"
          aria-label="Ask the evidence copilot"
        />
        <button disabled={!question.trim()} aria-label="Ask question">
          <Send size={15} />
        </button>
      </form>
      <p className="copilot-boundary">Deterministic retrieval · no external model · no clinical advice</p>
    </section>
  );
}

function DetailPanel({
  detail,
  loading,
  onClose,
  onReviewed,
}: {
  detail: Awaited<ReturnType<typeof api.detail>> | undefined;
  loading: boolean;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <aside className="detail-drawer">
        <button
          className="drawer-close"
          onClick={onClose}
          aria-label="Close dossier"
        >
          <X size={19} />
        </button>
        {loading || !detail ? (
          <div className="drawer-loading">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            <div className="dossier-header">
              <p className="eyebrow">Evidence dossier · {detail.capability}</p>
              <h2>{detail.name}</h2>
              <p>
                <MapPin size={14} />
                {[detail.city, detail.district, detail.state, detail.pincode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <div className="dossier-verdict">
                <TierBadge tier={detail.tier} />
                <strong>
                  {detail.evidence_strength}
                  <small>/100</small>
                </strong>
              </div>
              <p className="verdict-copy">
                Visible evidence strength—not accreditation, availability or
                clinical quality.
              </p>
            </div>
            <EvidenceCopilot key={detail.facility_id} detail={detail} />
            <section className="dossier-section">
              <div className="section-title">
                <h3>Why this score</h3>
                <span>model v1.0</span>
              </div>
              <div className="component-grid">
                {[
                  ["Direct statement", detail.component_direct, 30],
                  ["Equipment", detail.component_equipment, 20],
                  ["Staff & specialty", detail.component_staff, 20],
                  ["Capacity", detail.component_capacity, 10],
                  ["Procedures", detail.component_procedure, 10],
                  ["Source diversity", detail.component_sources, 10],
                ].map(([label, value, max]) => (
                  <div className="component" key={String(label)}>
                    <span>{label}</span>
                    <div>
                      <i
                        style={{
                          width: `${(Number(value) / Number(max)) * 100}%`,
                        }}
                      />
                    </div>
                    <b>
                      {value}/{max}
                    </b>
                  </div>
                ))}
              </div>
            </section>
            {detail.flags.length > 0 && (
              <section className="dossier-section flags-section">
                <div className="section-title">
                  <h3>Verification flags</h3>
                  <span>{detail.flags.length}</span>
                </div>
                {detail.flags.map((flag) => (
                  <div className="quality-flag" key={flag}>
                    <AlertTriangle size={16} />
                    <span>{flag.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </section>
            )}
            <section className="dossier-section">
              <div className="section-title">
                <h3>Evidence receipts</h3>
                <span>{detail.evidence.length} excerpts</span>
              </div>
              <div className="receipt-list">
                {detail.evidence.length === 0 ? (
                  <p className="muted">
                    No supporting excerpt was found outside the capability
                    claim.
                  </p>
                ) : (
                  detail.evidence.map((receipt, index) => (
                    <article
                      className="receipt"
                      key={`${receipt.source_field}-${index}`}
                    >
                      <div>
                        <FileCheck2 size={15} />
                        <strong>{receipt.evidence_type}</strong>
                        <span>{receipt.source_field}</span>
                      </div>
                      <blockquote>“{receipt.quote}”</blockquote>
                    </article>
                  ))
                )}
              </div>
            </section>
            <section className="dossier-section">
              <div className="section-title">
                <h3>Known gaps</h3>
                <span>Honest uncertainty</span>
              </div>
              <ul className="gap-list">
                {detail.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </section>
            <section className="dossier-section">
              <div className="section-title">
                <h3>Source trail</h3>
                <span>{detail.source_domain_count} domains</span>
              </div>
              <div className="source-list">
                {detail.source_urls.slice(0, 5).map((url, index) => (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    key={`${url}-${index}`}
                  >
                    {sourceHost(url)}
                    <ArrowUpRight size={13} />
                  </a>
                ))}
              </div>
            </section>
            {detail.last_review && (
              <div className="prior-review">
                <Check size={15} />
                <span>
                  Last reviewed: <strong>{detail.last_review.decision}</strong>{" "}
                  · {detail.last_review.note}
                </span>
              </div>
            )}
            <button className="review-cta" onClick={() => setReviewOpen(true)}>
              <ShieldCheck size={17} />
              {DEMO_MODE
                ? "Try a session-only planner decision"
                : "Record a planner decision"}
            </button>
            {reviewOpen && (
              <ReviewForm
                facilityId={detail.facility_id}
                capability={detail.capability}
                onCancel={() => setReviewOpen(false)}
                onSaved={() => {
                  setReviewOpen(false);
                  onReviewed();
                }}
              />
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function ReviewForm({
  facilityId,
  capability,
  onCancel,
  onSaved,
}: {
  facilityId: string;
  capability: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const [decision, setDecision] =
    useState<ReviewDecision["decision"]>("VERIFY");
  const [overrideTier, setOverrideTier] = useState<TrustTier>("MODERATE");
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api.review({
        facility_id: facilityId,
        capability,
        decision,
        override_tier: decision === "OVERRIDE" ? overrideTier : null,
        note,
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["facility", facilityId] });
      onSaved();
    },
  });
  return (
    <div className="review-form">
      <div className="section-title">
        <h3>Planner decision</h3>
        <button onClick={onCancel}>
          <X size={16} />
        </button>
      </div>
      <div className="decision-grid">
        {(["CONFIRM", "VERIFY", "OVERRIDE"] as const).map((item) => (
          <button
            className={decision === item ? "selected" : ""}
            onClick={() => setDecision(item)}
            key={item}
          >
            {item === "CONFIRM"
              ? "Confirm"
              : item === "VERIFY"
                ? "Field verification"
                : "Override tier"}
          </button>
        ))}
      </div>
      {decision === "OVERRIDE" && (
        <label>
          <span>Override evidence tier</span>
          <select
            value={overrideTier}
            onChange={(event) =>
              setOverrideTier(event.target.value as TrustTier)
            }
          >
            <option value="STRONG">Strong</option>
            <option value="MODERATE">Moderate</option>
            <option value="WEAK">Weak</option>
            <option value="INSUFFICIENT">Insufficient</option>
          </select>
        </label>
      )}
      <label>
        <span>
          Decision note <b>required</b>
        </span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What did you verify, and what should the next planner know?"
        />
      </label>
      {mutation.isError && (
        <p className="form-error">The review was not saved.</p>
      )}
      <div className="form-actions">
        <button onClick={onCancel}>Cancel</button>
        <button
          className="primary"
          disabled={note.trim().length < 10 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save decision"}
        </button>
      </div>
    </div>
  );
}

function DataHealthView() {
  const health = useQuery({
    queryKey: ["data-health"],
    queryFn: api.dataHealth,
  });
  const evaluation = useQuery({
    queryKey: ["evaluation"],
    queryFn: api.evaluation,
    retry: false,
  });
  if (health.isLoading)
    return (
      <main className="subpage">
        <SkeletonRows />
      </main>
    );
  if (!health.data)
    return (
      <main className="subpage">
        <div className="empty-state">
          <AlertTriangle />
          <h3>Health profile unavailable</h3>
        </div>
      </main>
    );
  const data = health.data;
  return (
    <main className="subpage">
      <PageLead
        eyebrow="Dataset health"
        title="Know the blind spots before making the map."
        badge={
          DEMO_MODE ? "Catalog snapshot · evaluated" : "Shared catalog · live profile"
        }
      />
      <section className="metrics-grid health-metrics">
        <Metric
          label="Facility records"
          value={data.total_records.toLocaleString()}
        />
        <Metric
          label="Canonical facilities"
          value={data.unique_facilities.toLocaleString()}
        />
        <Metric
          label="Raw state variants"
          value={data.raw_state_values}
          tone="warning"
          hint="before normalization"
        />
        <Metric
          label="Coordinate conflicts"
          value={data.coordinate_conflicts.toLocaleString()}
          tone="review"
        />
        <Metric
          label="Verified / plausible locations"
          value={`${data.verified_location_rate}%`}
        />
      </section>
      <section className="health-layout">
        <article className="health-card">
          <CardHeading
            eyebrow="Completeness"
            title="Coverage by evidence field"
            icon={<Database size={19} />}
          />
          <div className="coverage-bars">
            {data.coverage.map((item) => (
              <div key={item.field}>
                <span>{item.field}</span>
                <div>
                  <i style={{ width: `${item.value}%` }} />
                </div>
                <b>{item.value}%</b>
              </div>
            ))}
          </div>
        </article>
        <article className="health-card">
          <CardHeading
            eyebrow="Claim pressure"
            title="Claims with multi-facet support"
            icon={<Hospital size={19} />}
          />
          <ResponsiveContainer width="100%" height={330}>
            <BarChart
              data={data.capability_evidence}
              margin={{ top: 18, right: 8, left: 0, bottom: 4 }}
            >
              <CartesianGrid vertical={false} stroke="#dbe3df" />
              <XAxis dataKey="capability" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="claimed" fill="#b8c6c0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="supported" fill="#176f68" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <span>
              <i className="claim" />
              Claimed
            </span>
            <span>
              <i className="supported" />
              Supported by 2+ facets
            </span>
          </div>
        </article>
      </section>
      {evaluation.data && (
        <section className="evaluation-card">
          <div className="evaluation-heading">
            <div>
              <p className="eyebrow">MLflow release evaluation</p>
              <h2>Trust-layer quality gate</h2>
            </div>
            <span
              className={
                evaluation.data.status === "PASS" ? "is-pass" : "is-fail"
              }
            >
              <ShieldCheck size={15} />
              {evaluation.data.status} ·{" "}
              {evaluation.data.checks.filter((item) => item.passed).length}/
              {evaluation.data.checks.length} checks
            </span>
          </div>
          <div className="evaluation-checks">
            {evaluation.data.checks.map((item) => (
              <article key={item.name}>
                <Check size={14} />
                <div>
                  <strong>{item.label}</strong>
                  <small>
                    {item.passed
                      ? `0 violations · no ${item.detail}`
                      : `${item.value.toLocaleString()} ${item.detail}`}
                  </small>
                </div>
                <b>{item.passed ? "PASS" : "FAIL"}</b>
              </article>
            ))}
          </div>
          <footer>
            <span>
              {evaluation.data.profiles_evaluated.toLocaleString()} profiles ·{" "}
              {evaluation.data.score_version} ·{" "}
              {new Date(evaluation.data.evaluated_at).toLocaleDateString()}
            </span>
            {evaluation.data.mlflow_run_url && (
              <a
                href={evaluation.data.mlflow_run_url}
                target="_blank"
                rel="noreferrer"
              >
                Open MLflow run <ArrowUpRight size={13} />
              </a>
            )}
          </footer>
        </section>
      )}
    </main>
  );
}

function MethodologyView() {
  return (
    <main className="subpage methodology">
      <PageLead
        eyebrow="Methodology"
        title="A score that can show its work."
        badge="Evidence strength · not hospital quality"
      />
      <section className="method-grid">
        <article>
          <span>01</span>
          <h2>Normalize</h2>
          <p>
            Canonicalize geography through PIN data while retaining raw fields.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Extract</h2>
          <p>
            Find capability-specific statements, equipment, staff, procedures
            and capacity.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Challenge</h2>
          <p>
            Flag contamination, implausible numbers, contradictions and location
            mismatch.
          </p>
        </article>
        <article>
          <span>04</span>
          <h2>Remember</h2>
          <p>
            Persist planner decisions with identity, note and scoring version.
          </p>
        </article>
      </section>
      <section className="weight-card">
        <div>
          <p className="eyebrow">Evidence model v1.0</p>
          <h2>Transparent by construction</h2>
        </div>
        <div className="weight-list">
          {[
            ["Direct facility statement", 30],
            ["Equipment", 20],
            ["Staff and specialty", 20],
            ["Capacity", 10],
            ["Procedures", 10],
            ["Source diversity", 10],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>{value} pts</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="tier-card">
        <div>
          <p className="eyebrow">Decision guardrails</p>
          <h2>Scores become tiers only with enough evidence facets.</h2>
        </div>
        <div className="tier-ladder">
          <span>
            <i style={{ background: TIER_COLORS.STRONG }} />
            <strong>Strong</strong>
            <small>75+ · 3 facets</small>
          </span>
          <span>
            <i style={{ background: TIER_COLORS.MODERATE }} />
            <strong>Moderate</strong>
            <small>50+ · 2 facets</small>
          </span>
          <span>
            <i style={{ background: TIER_COLORS.WEAK }} />
            <strong>Weak</strong>
            <small>25+ points</small>
          </span>
          <span>
            <i style={{ background: TIER_COLORS.INSUFFICIENT }} />
            <strong>Insufficient</strong>
            <small>Below 25</small>
          </span>
        </div>
        <p>
          <AlertTriangle size={15} /> Contextual-source risk always routes the
          profile to human review, regardless of score.
        </p>
      </section>
    </main>
  );
}

export default App;
