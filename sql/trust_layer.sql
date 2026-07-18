-- CareProof trust layer. Statements are separated for the deployment runner.

CREATE SCHEMA IF NOT EXISTS workspace.careproof
COMMENT 'Evidence-first facility intelligence derived from the Virtue Foundation marketplace share';

-- COMMAND ----------

CREATE OR REPLACE TABLE workspace.careproof.facility_clean
COMMENT 'One canonical facility per cluster with normalized geography, parsed evidence arrays, and quality flags'
AS
WITH pin AS (
  SELECT
    pincode,
    FIRST(district, true) AS pin_district,
    FIRST(statename, true) AS pin_state,
    AVG(TRY_CAST(latitude AS DOUBLE)) AS pin_latitude,
    AVG(TRY_CAST(longitude AS DOUBLE)) AS pin_longitude
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
  WHERE TRY_CAST(latitude AS DOUBLE) BETWEEN 6 AND 38.6
    AND TRY_CAST(longitude AS DOUBLE) BETWEEN 68 AND 98
  GROUP BY pincode
),
raw AS (
  SELECT
    COALESCE(NULLIF(TRIM(f.cluster_id), ''), f.unique_id) AS facility_id,
    f.unique_id AS raw_record_id,
    f.name,
    f.address_city AS city,
    f.address_stateOrRegion AS raw_state,
    TRY_CAST(f.address_zipOrPostcode AS BIGINT) AS pincode,
    CONCAT_WS(', ',
      NULLIF(TRIM(f.address_line1), ''),
      NULLIF(TRIM(f.address_line2), ''),
      NULLIF(TRIM(f.address_line3), ''),
      NULLIF(TRIM(f.address_city), ''),
      NULLIF(TRIM(f.address_stateOrRegion), ''),
      NULLIF(TRIM(f.address_zipOrPostcode), '')
    ) AS address,
    f.description,
    f.latitude AS raw_latitude,
    f.longitude AS raw_longitude,
    p.pin_district,
    p.pin_state,
    p.pin_latitude,
    p.pin_longitude,
    TRY_CAST(f.numberDoctors AS DOUBLE) AS number_doctors,
    TRY_CAST(f.capacity AS DOUBLE) AS capacity,
    TRY_CAST(f.recency_of_page_update AS DATE) AS recency_date,
    COALESCE(FROM_JSON(f.capability, 'ARRAY<STRING>'), CAST(ARRAY() AS ARRAY<STRING>)) AS capability_items,
    COALESCE(FROM_JSON(f.procedure, 'ARRAY<STRING>'), CAST(ARRAY() AS ARRAY<STRING>)) AS procedure_items,
    COALESCE(FROM_JSON(f.equipment, 'ARRAY<STRING>'), CAST(ARRAY() AS ARRAY<STRING>)) AS equipment_items,
    COALESCE(FROM_JSON(f.specialties, 'ARRAY<STRING>'), CAST(ARRAY() AS ARRAY<STRING>)) AS specialty_items,
    COALESCE(FROM_JSON(f.source_urls, 'ARRAY<STRING>'), CAST(ARRAY() AS ARRAY<STRING>)) AS source_urls,
    COALESCE(FROM_JSON(f.source_types, 'ARRAY<STRING>'), CAST(ARRAY() AS ARRAY<STRING>)) AS source_types,
    f.officialWebsite AS official_website
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  LEFT JOIN pin p ON TRY_CAST(f.address_zipOrPostcode AS BIGINT) = p.pincode
),
measured AS (
  SELECT
    *,
    CASE
      WHEN pin_latitude IS NOT NULL
       AND raw_latitude BETWEEN 6 AND 38.6
       AND raw_longitude BETWEEN 68 AND 98
      THEN 6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(raw_latitude - pin_latitude) / 2), 2)
        + COS(RADIANS(pin_latitude)) * COS(RADIANS(raw_latitude))
        * POWER(SIN(RADIANS(raw_longitude - pin_longitude) / 2), 2)
      ))
    END AS pin_distance_km,
    ARRAY_DISTINCT(
      FILTER(
        TRANSFORM(source_urls, url -> LOWER(PARSE_URL(url, 'HOST'))),
        domain -> domain IS NOT NULL AND domain <> ''
      )
    ) AS source_domains,
    FILTER(
      SPLIT(REGEXP_REPLACE(COALESCE(description, ''), '[\\r\\n]+', ' '), '[.!?]+[ ]+'),
      sentence -> LENGTH(TRIM(sentence)) > 8
    ) AS description_sentences
  FROM raw
),
normalized AS (
  SELECT
    *,
    COALESCE(
      INITCAP(TRIM(pin_state)),
      CASE LOWER(REGEXP_REPLACE(TRIM(raw_state), '[^a-zA-Z]', ''))
        WHEN 'tamilnadu' THEN 'Tamil Nadu'
        WHEN 'orissa' THEN 'Odisha'
        WHEN 'nctofdelhi' THEN 'Delhi'
        WHEN 'jammuandkashmir' THEN 'Jammu And Kashmir'
        ELSE NULLIF(TRIM(raw_state), '')
      END
    ) AS canonical_state,
    INITCAP(TRIM(pin_district)) AS canonical_district,
    CASE
      WHEN pin_latitude IS NOT NULL AND pin_distance_km <= 25 THEN 'VERIFIED'
      WHEN pin_latitude IS NOT NULL AND pin_distance_km <= 100 THEN 'PLAUSIBLE'
      WHEN pin_latitude IS NOT NULL THEN 'PIN_FALLBACK'
      WHEN raw_latitude BETWEEN 6 AND 38.6 AND raw_longitude BETWEEN 68 AND 98 THEN 'RAW_UNVERIFIED'
      ELSE 'UNKNOWN'
    END AS location_confidence,
    CASE
      WHEN pin_latitude IS NOT NULL AND (pin_distance_km > 100 OR pin_distance_km IS NULL) THEN pin_latitude
      WHEN raw_latitude BETWEEN 6 AND 38.6 AND raw_longitude BETWEEN 68 AND 98 THEN raw_latitude
      ELSE NULL
    END AS canonical_latitude,
    CASE
      WHEN pin_longitude IS NOT NULL AND (pin_distance_km > 100 OR pin_distance_km IS NULL) THEN pin_longitude
      WHEN raw_latitude BETWEEN 6 AND 38.6 AND raw_longitude BETWEEN 68 AND 98 THEN raw_longitude
      ELSE NULL
    END AS canonical_longitude,
    FILTER(ARRAY(
      IF(NOT (raw_latitude BETWEEN 6 AND 38.6 AND raw_longitude BETWEEN 68 AND 98), 'COORDINATE_OUTSIDE_INDIA', NULL),
      IF(pin_distance_km > 100, 'COORDINATE_PIN_CONFLICT', NULL),
      IF(pin_state IS NOT NULL AND raw_state IS NOT NULL
         AND LOWER(REGEXP_REPLACE(raw_state, '[^a-zA-Z0-9]', '')) <> LOWER(REGEXP_REPLACE(pin_state, '[^a-zA-Z0-9]', '')),
         'STATE_PIN_MISMATCH', NULL),
      IF(recency_date > CURRENT_DATE(), 'FUTURE_RECENCY_DATE', NULL),
      IF(number_doctors > 5000, 'IMPLAUSIBLE_DOCTOR_COUNT', NULL),
      IF(capacity > 10000, 'IMPLAUSIBLE_CAPACITY', NULL),
      IF(LOWER(COALESCE(description, '')) RLIKE 'nearby|listed as|directory|project page|distance from|map listing',
         'CONTEXTUAL_SOURCE_RISK', NULL)
    ), flag -> flag IS NOT NULL) AS quality_flags
  FROM measured
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY facility_id
    ORDER BY SIZE(source_domains) DESC, SIZE(capability_items) DESC, raw_record_id
  ) AS canonical_rank
  FROM normalized
)
SELECT
  facility_id,
  raw_record_id,
  name,
  city,
  raw_state,
  canonical_state,
  canonical_district,
  pincode,
  address,
  description,
  number_doctors,
  capacity,
  recency_date,
  raw_latitude,
  raw_longitude,
  pin_latitude,
  pin_longitude,
  ROUND(pin_distance_km, 1) AS pin_distance_km,
  location_confidence,
  canonical_latitude,
  canonical_longitude,
  capability_items,
  procedure_items,
  equipment_items,
  specialty_items,
  description_sentences,
  ARRAY_DISTINCT(source_urls) AS source_urls,
  ARRAY_DISTINCT(source_types) AS source_types,
  source_domains,
  SIZE(source_domains) AS source_domain_count,
  official_website,
  quality_flags
FROM ranked
WHERE canonical_rank = 1;

-- COMMAND ----------

CREATE OR REPLACE TABLE workspace.careproof.facility_capability_features
COMMENT 'Capability-level evidence facets and scoring inputs before tier assignment'
AS
WITH ontology AS (
  SELECT * FROM VALUES
    ('ICU', '(^|[^a-z])(icu|intensive care|critical care)([^a-z]|$)',
      'ventilator|oxygen|patient monitor|cardiac monitor|defibrillator|infusion pump|intensive care unit|icu bed',
      'anesth|intensiv|critical care|pulmon|emergency medicine',
      'critical care|intensive care|mechanical ventilation|resuscitation'),
    ('NICU', '(^|[^a-z])(nicu|neonatal intensive|neonatal care)([^a-z]|$)',
      'incubator|neonatal ventilator|phototherapy|radiant warmer|nicu|cpap',
      'neonat|pediatric|paediatric',
      'neonatal resuscitation|newborn care|premature|preterm'),
    ('EMERGENCY', 'emergency|casualty|24/7 emergency',
      'defibrillator|resuscitation|ambulance|emergency trolley|trauma bay|ventilator',
      'emergency medicine|trauma|critical care',
      'resuscitation|emergency surgery|triage|stabilization'),
    ('MATERNITY', 'maternity|obstetric|delivery|labour room|labor room|gynae',
      'fetal monitor|foetal monitor|ultrasound|labour room|delivery room|radiant warmer|incubator',
      'obstetric|gynae|midwi|neonat',
      'delivery|caesarean|cesarean|antenatal|postnatal'),
    ('ONCOLOGY', 'oncolog|cancer|chemotherapy|radiotherapy',
      'linear accelerator|radiotherapy|pet scan|brachytherapy|tomotherapy|chemotherapy',
      'oncolog|cancer specialist|radiation medicine',
      'chemotherapy|radiotherapy|cancer surgery|brachytherapy'),
    ('TRAUMA', '(^|[^a-z])trauma([^a-z]|$)|accident care',
      'ct scanner|x-ray|operating theatre|operating theater|blood bank|ventilator|ambulance',
      'trauma|orthop|neurosurg|emergency medicine',
      'trauma surgery|fracture|emergency surgery|resuscitation')
    AS ontology(capability, claim_pattern, equipment_pattern, staff_pattern, procedure_pattern)
),
candidate AS (
  SELECT
    f.*,
    o.*,
    LOWER(CONCAT_WS(' ', f.capability_items)) RLIKE o.claim_pattern AS claimed,
    FILTER(f.description_sentences, sentence -> LOWER(sentence) RLIKE o.claim_pattern) AS direct_quotes,
    FILTER(f.equipment_items, item -> LOWER(item) RLIKE o.equipment_pattern) AS equipment_quotes,
    FILTER(f.specialty_items, item -> LOWER(item) RLIKE o.staff_pattern) AS staff_quotes,
    FILTER(f.procedure_items, item -> LOWER(item) RLIKE o.procedure_pattern) AS procedure_quotes
  FROM workspace.careproof.facility_clean f
  CROSS JOIN ontology o
),
facets AS (
  SELECT
    *,
    SIZE(direct_quotes) > 0 AS has_direct,
    SIZE(equipment_quotes) > 0 AS has_equipment,
    SIZE(staff_quotes) > 0 AS has_staff,
    SIZE(procedure_quotes) > 0 AS has_procedure,
    capacity IS NOT NULL AND capacity > 0 AND SIZE(direct_quotes) > 0 AS has_capacity,
    source_domain_count >= 2 AS has_sources,
    ARRAY_CONTAINS(quality_flags, 'CONTEXTUAL_SOURCE_RISK') AS contextual_source_risk
  FROM candidate
)
SELECT
  facility_id,
  capability,
  claimed,
  direct_quotes,
  equipment_quotes,
  staff_quotes,
  procedure_quotes,
  has_direct,
  has_equipment,
  has_staff,
  has_procedure,
  has_capacity,
  has_sources,
  contextual_source_risk,
  CAST(has_direct AS INT) + CAST(has_equipment AS INT) + CAST(has_staff AS INT)
    + CAST(has_procedure AS INT) + CAST(has_capacity AS INT) + CAST(has_sources AS INT) AS facet_count
FROM facets
WHERE claimed OR has_direct OR has_equipment OR has_staff OR has_procedure;

-- COMMAND ----------

CREATE OR REPLACE TABLE workspace.careproof.facility_capability_evidence
COMMENT 'Sentence- and item-level evidence receipts shown in facility dossiers'
AS
SELECT facility_id, capability, 'Direct service statement' AS evidence_type, 'description' AS source_field,
       quote, true AS supports, 1 AS evidence_order
FROM workspace.careproof.facility_capability_features
LATERAL VIEW EXPLODE(direct_quotes) q AS quote
UNION ALL
SELECT facility_id, capability, 'Capability-specific equipment', 'equipment', quote, true, 2
FROM workspace.careproof.facility_capability_features
LATERAL VIEW EXPLODE(equipment_quotes) q AS quote
WHERE NULLIF(TRIM(quote), '') IS NOT NULL
UNION ALL
SELECT facility_id, capability, 'Relevant staff or specialty', 'specialties', quote, true, 3
FROM workspace.careproof.facility_capability_features
LATERAL VIEW EXPLODE(staff_quotes) q AS quote
WHERE NULLIF(TRIM(quote), '') IS NOT NULL
UNION ALL
SELECT facility_id, capability, 'Supporting procedure', 'procedure', quote, true, 4
FROM workspace.careproof.facility_capability_features
LATERAL VIEW EXPLODE(procedure_quotes) q AS quote
WHERE NULLIF(TRIM(quote), '') IS NOT NULL;

-- COMMAND ----------

CREATE OR REPLACE TABLE workspace.careproof.facility_trust_profile
COMMENT 'Versioned, explainable evidence-strength ranking by facility and capability'
AS
WITH components AS (
  SELECT
    f.facility_id,
    f.name,
    f.city,
    f.canonical_state,
    f.canonical_district,
    f.location_confidence,
    f.canonical_latitude,
    f.canonical_longitude,
    f.source_domain_count,
    f.quality_flags,
    c.capability,
    c.claimed,
    c.facet_count,
    IF(c.has_direct, 30, 0) AS component_direct,
    IF(c.has_equipment, 20, 0) AS component_equipment,
    IF(c.has_staff, 20, 0) AS component_staff,
    IF(c.has_capacity, 10, 0) AS component_capacity,
    IF(c.has_procedure, 10, 0) AS component_procedure,
    IF(c.has_sources, 10, 0) AS component_sources,
    c.contextual_source_risk
  FROM workspace.careproof.facility_capability_features c
  JOIN workspace.careproof.facility_clean f USING (facility_id)
),
scored AS (
  SELECT
    *,
    component_direct + component_equipment + component_staff + component_capacity
      + component_procedure + component_sources AS support_points,
    IF(contextual_source_risk, 25, 0) AS penalty_points
  FROM components
),
bounded AS (
  SELECT
    *,
    CASE
      WHEN claimed AND facet_count <= 1 THEN LEAST(20, GREATEST(0, support_points - penalty_points))
      ELSE GREATEST(0, LEAST(100, support_points - penalty_points))
    END AS evidence_strength,
    ARRAY_DISTINCT(CONCAT(
      quality_flags,
      FILTER(ARRAY(
        IF(claimed AND facet_count <= 1, 'CLAIM_WITHOUT_CORROBORATION', NULL),
        IF(contextual_source_risk, 'CONTEXTUAL_EVIDENCE_REQUIRES_REVIEW', NULL)
      ), item -> item IS NOT NULL)
    )) AS flags
  FROM scored
)
SELECT
  *,
  CASE
    WHEN contextual_source_risk THEN 'NEEDS_REVIEW'
    WHEN evidence_strength >= 75 AND facet_count >= 3 THEN 'STRONG'
    WHEN evidence_strength >= 50 AND facet_count >= 2 THEN 'MODERATE'
    WHEN evidence_strength >= 25 THEN 'WEAK'
    ELSE 'INSUFFICIENT'
  END AS tier,
  'v1.0' AS score_version,
  CURRENT_TIMESTAMP() AS scored_at
FROM bounded;

-- COMMAND ----------

CREATE OR REPLACE TABLE workspace.careproof.region_summary
COMMENT 'Evidence-tier distribution by capability, state, and district'
AS
SELECT
  capability,
  canonical_state,
  canonical_district,
  COUNT(*) AS assessed_facilities,
  COUNT_IF(tier = 'STRONG') AS strong,
  COUNT_IF(tier = 'MODERATE') AS moderate,
  COUNT_IF(tier = 'WEAK') AS weak,
  COUNT_IF(tier = 'INSUFFICIENT') AS insufficient,
  COUNT_IF(tier = 'NEEDS_REVIEW') AS needs_review,
  COUNT_IF(location_confidence IN ('PIN_FALLBACK', 'UNKNOWN')) AS location_issues,
  ROUND(AVG(evidence_strength), 1) AS mean_evidence_strength
FROM workspace.careproof.facility_trust_profile
GROUP BY capability, canonical_state, canonical_district;
