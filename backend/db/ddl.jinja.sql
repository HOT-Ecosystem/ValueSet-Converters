/* TODO's (general)
    1. For each table: don't do anything if these tables exist & initialized
    2. Add alters to fix data types
      Although, should really move this stuff to dtypes settings when creating dataframe that loads data into db.
*/
-- Column data types ---------------------------------------------------------------------------------------------------
-- TODO: See "TODO's (general)" #2 at top of this file.
ALTER TABLE {{schema}}concept_set_container ALTER COLUMN project_id TYPE text;
ALTER TABLE {{schema}}concept_set_container ALTER COLUMN assigned_informatician TYPE text;
ALTER TABLE {{schema}}concept_set_container ALTER COLUMN assigned_sme TYPE text;
ALTER TABLE {{schema}}concept_set_container ALTER COLUMN intention TYPE text;
ALTER TABLE {{schema}}concept_set_container ALTER COLUMN n3c_reviewer TYPE text;
ALTER TABLE IF EXISTS test_{{schema}}concept_set_container ALTER COLUMN project_id TYPE text;
ALTER TABLE IF EXISTS test_{{schema}}concept_set_container ALTER COLUMN assigned_informatician TYPE text;
ALTER TABLE IF EXISTS test_{{schema}}concept_set_container ALTER COLUMN assigned_sme TYPE text;
ALTER TABLE IF EXISTS test_{{schema}}concept_set_container ALTER COLUMN intention TYPE text;
ALTER TABLE IF EXISTS test_{{schema}}concept_set_container ALTER COLUMN n3c_reviewer TYPE text;

-- some rows in concept_set_members have been duplicates, so need to get rid of those
--  might be with import/loading errors, but just fixing it here for now

SELECT * INTO {{schema}}concept_set_members FROM {{schema}}concept_set_members_with_dups;

SELECT DISTINCT * INTO {{schema}}concept_set_members FROM {{schema}}concept_set_members_with_dups;

DROP TABLE concept_set_members_with_dups;

-- Indexes and more ----------------------------------------------------------------------------------------------------
ALTER TABLE {{schema}}concept ADD PRIMARY KEY(concept_id);

CREATE INDEX IF NOT EXISTS concept_idx on {{schema}}concept(concept_id);

CREATE INDEX IF NOT EXISTS concept_idx2 on {{schema}}concept(concept_code);

CREATE INDEX IF NOT EXISTS csm_idx1 on {{schema}}concept_set_members(codeset_id);

CREATE INDEX IF NOT EXISTS csm_idx2 on {{schema}}concept_set_members(concept_id);

CREATE INDEX IF NOT EXISTS csm_idx3 on {{schema}}concept_set_members(codeset_id, concept_id);

CREATE INDEX IF NOT EXISTS vi_idx1 on {{schema}}concept_set_version_item(codeset_id);

CREATE INDEX IF NOT EXISTS vi_idx2 on {{schema}}concept_set_version_item(concept_id);

CREATE INDEX IF NOT EXISTS vi_idx3 on {{schema}}concept_set_version_item(codeset_id, concept_id);

CREATE INDEX IF NOT EXISTS cr_idx1 on {{schema}}concept_relationship(concept_id_1);

CREATE INDEX IF NOT EXISTS cr_idx2 on {{schema}}concept_relationship(concept_id_2);

CREATE INDEX IF NOT EXISTS cr_idx3 on {{schema}}concept_relationship(concept_id_1, concept_id_2);

CREATE INDEX IF NOT EXISTS cs_idx1 on {{schema}}code_sets(codeset_id);

ALTER TABLE {{schema}}code_sets ADD PRIMARY KEY(codeset_id);

CREATE INDEX IF NOT EXISTS csc_idx1 on {{schema}}concept_set_container(concept_set_id);

CREATE INDEX IF NOT EXISTS csc_idx2 on {{schema}}concept_set_container(concept_set_name);

CREATE INDEX IF NOT EXISTS csc_idx3 on {{schema}}concept_set_container(concept_set_id, created_at DESC);

-- concept_set_container has duplicate records except for the created_at col
--  get rid of duplicates, keeping the most recent.
--  code from https://stackoverflow.com/a/28085614/1368860
--      which also has code that works for databases other than postgres, if we ever need that
WITH deduped AS (
    SELECT DISTINCT ON (concept_set_id) concept_set_id, created_at
    FROM {{schema}}concept_set_container
    ORDER BY concept_set_id, created_at DESC
)
DELETE FROM {{schema}}concept_set_container csc
WHERE NOT EXISTS (
    SELECT FROM deduped dd
    WHERE csc.concept_set_id = dd.concept_set_id
  AND csc.created_at = dd.created_at
    );

DROP TABLE IF EXISTS {{schema}}cset_members_items CASCADE;

CREATE TABLE {{schema}}cset_members_items AS
SELECT
    COALESCE(csm.codeset_id, item.codeset_id) AS codeset_id,
    COALESCE(csm.concept_id, item.concept_id) AS concept_id,
    csm.codeset_id IS NOT NULL AS csm,
    item.codeset_id IS NOT NULL AS item,
    array_to_string(array_remove(ARRAY[
                                     CASE WHEN item."isExcluded" THEN 'isExcluded' ELSE NULL END,
                                     CASE WHEN item."includeDescendants" THEN 'includeDescendants' ELSE NULL END,
                                     CASE WHEN item."includeMapped" THEN 'includeMapped' ELSE NULL END ],
                                 NULL), ',') AS item_flags,
    item."isExcluded",
    item."includeDescendants",
    item."includeMapped"
FROM {{schema}}concept_set_members csm
FULL OUTER JOIN {{schema}}concept_set_version_item item
ON csm.codeset_id = item.codeset_id
    AND csm.concept_id = item.concept_id
WHERE csm.codeset_id IS NOT NULL
   OR item.codeset_id IS NOT NULL;

CREATE INDEX csmi_idx1 ON {{schema}}cset_members_items(codeset_id);

CREATE INDEX csmi_idx2 ON {{schema}}cset_members_items(concept_id);

CREATE INDEX csmi_idx3 ON {{schema}}cset_members_items(codeset_id, concept_id);

DROP TABLE IF EXISTS {{schema}}members_items_summary;

CREATE TABLE {{schema}}members_items_summary AS
SELECT
    codeset_id,
    CASE WHEN item THEN 'Expression item -- '||
                        CASE WHEN LENGTH(item_flags) > 0 THEN item_flags ELSE 'no flags' END || '. '
         ELSE '' END ||
    CASE WHEN csm THEN 'Is a member' ELSE 'Is not a member' END AS grp,
    COUNT(*) AS cnt
FROM {{schema}}cset_members_items
GROUP by 1,2
UNION
SELECT codeset_id, 'Members' AS grp, COUNT(*) AS cnt FROM cset_members_items WHERE csm GROUP by 1,2
UNION
SELECT codeset_id, 'Expression items' AS grp, COUNT(*) AS cnt FROM cset_members_items WHERE item GROUP by 1,2;

CREATE INDEX mis1 on {{schema}}members_items_summary(codeset_id);

CREATE TABLE {{schema}}codeset_counts AS
SELECT codeset_id, JSON_AGG(JSON_BUILD_OBJECT('grp', grp, 'cnt', cnt)) AS counts FROM {{schema}}members_items_summary GROUP BY 1;

CREATE INDEX csc1 on {{schema}}codeset_counts(codeset_id);


DROP TABLE IF EXISTS all_csets;

CREATE TABLE {{schema}}all_csets AS
-- table instead of view for performance (no materialized views in mySQL)
-- TODO: but now we're on postgres should it be a materialized view?
WITH ac AS (SELECT DISTINCT cs.codeset_id,
                            cs.concept_set_version_title,
                            cs.project,
                            cs.concept_set_name,
                            cs.source_application,
                            cs.source_application_version,
                            cs.created_at                                  AS codeset_created_at,
                            cs.atlas_json,
                            cs.is_most_recent_version,
                            cs.version,
                            cs.comments,
                            cs.intention                                   AS codeset_intention,
                            cs.limitations,
                            cs.issues,
                            cs.update_message,
                            cs.status                                      AS codeset_status,
                            cs.has_review,
                            cs.reviewed_by,
                            cs.created_by                                  AS codeset_created_by,
                            cs.provenance,
                            cs.atlas_json_resource_url,
                            cs.parent_version_id,
                            cs.authoritative_source,
                            cs.is_draft,
                            ocs.rid                                        AS codeset_rid,
                            csc.project_id,
                            csc.assigned_informatician,
                            csc.assigned_sme,
                            csc.status                                     AS container_status,
                            csc.stage,
                            csc.intention                                  AS container_intention,
                            csc.n3c_reviewer,
                            csc.alias,
                            csc.archived,
                            csc.created_by                                 AS container_created_by,
                            csc.created_at                                 AS container_created_at,
                            ocsc.rid                                       AS container_rid,
                            -- COALESCE(members.concepts, 0) AS members,
                            -- COALESCE(items.concepts, 0) AS items,
                            COALESCE(cscc.approx_distinct_person_count, 0) AS distinct_person_cnt,
                            COALESCE(cscc.approx_total_record_count, 0)    AS total_cnt
            FROM code_sets cs
                     LEFT JOIN {{schema}}OMOPConceptSet ocs
                               ON cs.codeset_id = ocs."codesetId" -- need quotes because of caps in colname
                     JOIN {{schema}}concept_set_container csc ON cs.concept_set_name = csc.concept_set_name
                     LEFT JOIN {{schema}}omopconceptsetcontainer ocsc ON csc.concept_set_id = ocsc."conceptSetId"
                     LEFT JOIN {{schema}}concept_set_counts_clamped cscc ON cs.codeset_id = cscc.codeset_id)
SELECT ac.*, cscnt.counts
FROM ac
LEFT JOIN {{schema}}codeset_counts cscnt ON ac.codeset_id = cscnt.codeset_id;

CREATE INDEX ac_idx1 ON {{schema}}all_csets(codeset_id);

CREATE INDEX ac_idx2 ON {{schema}}all_csets(concept_set_name);

CREATE OR REPLACE VIEW {{schema}}cset_members_items_plus AS (
SELECT    csmi.*
        , c.vocabulary_id
        , c.concept_name
        , c.concept_code
        , c.concept_class_id
        , c.standard_concept
FROM {{schema}}cset_members_items csmi
JOIN concept c ON csmi.concept_id = c.concept_id);
-- CREATE INDEX csmip_idx1 ON {{schema}}cset_members_items_plus(codeset_id);
-- CREATE INDEX csmip_idx2 ON {{schema}}cset_members_items_plus(concept_id);
-- CREATE INDEX csmip_idx3 ON {{schema}}cset_members_items_plus(codeset_id, concept_id);

DROP TABLE IF EXISTS {{schema}}concepts_with_counts_ungrouped;
CREATE TABLE IF NOT EXISTS {{schema}}concepts_with_counts_ungrouped AS (
SELECT DISTINCT
        c.concept_id,
        c.concept_name,
        c.domain_id,
        c.vocabulary_id,
        c.concept_class_id,
        c.standard_concept,
        c.concept_code,
        c.invalid_reason,
        COALESCE(tu.total_count, 0) AS total_cnt,
        COALESCE(tu.distinct_person_count, 0) AS distinct_person_cnt,
        tu.domain
FROM {{schema}}concept c
LEFT JOIN {{schema}}deidentified_term_usage_by_domain_clamped tu ON c.concept_id = tu.concept_id);

CREATE INDEX ccu_idx1 ON {{schema}}concepts_with_counts_ungrouped(concept_id);
--CREATE INDEX ccu_idx2 ON concepts_with_counts_ungrouped(concept_id);

DROP TABLE IF EXISTS {{schema}}concepts_with_counts;
CREATE TABLE IF NOT EXISTS {{schema}}concepts_with_counts AS (
    SELECT  concept_id,
            concept_name,
            domain_id,
            vocabulary_id,
            concept_class_id,
            standard_concept,
            concept_code,
            invalid_reason,
            COUNT(DISTINCT domain) AS domain_cnt,
            array_to_string(array_agg(domain), ',') AS domain,
            SUM(total_cnt) AS total_cnt,
            array_to_string(array_agg(distinct_person_cnt), ',') AS distinct_person_cnt
    FROM {{schema}}concepts_with_counts_ungrouped
    GROUP BY 1,2,3,4,5,6,7,8
    ORDER BY concept_id, domain );

CREATE INDEX cc_idx1 ON {{schema}}concepts_with_counts(concept_id);

DROP TABLE {{schema}}concepts_with_counts_ungrouped CASCADE;

-- concept_relationship_plus takes a long time to build
DROP TABLE IF EXISTS {{schema}}concept_relationship_plus;
-- using concept_relationship_plus not just for convenience in debugging now but also
-- single source of truth for concept_relationship in termhub. quit using concept_relationship
-- and concept_relationship_subsumes_only in queries.
-- for now, because of bug (https://github.com/jhu-bids/TermHub/issues/191 and https://github.com/jhu-bids/TermHub/pull/190)
-- filtering out cr records including invalid concepts. this is probably not the right thing to do
-- in the long term, but should fix that bug and let us move forward with immediate need to get pilot started (2022-01-4)

CREATE TABLE IF NOT EXISTS {{schema}}concept_relationship_plus AS (
  SELECT    c1.vocabulary_id AS vocabulary_id_1
          , cr.concept_id_1
          , c1.concept_name AS concept_name_1
          , c1.concept_code
          , cr.relationship_id
          , c2.vocabulary_id AS vocabulary_id_2
          , cr.concept_id_2
          , c2.concept_name AS concept_name_2
  FROM {{schema}}concept_relationship cr
  JOIN concept c1 ON cr.concept_id_1 = c1.concept_id -- AND c1.invalid_reason IS NULL
  JOIN concept c2 ON cr.concept_id_2 = c2.concept_id -- AND c2.invalid_reason IS NULL
                --AND c2.standard_concept IS NOT NULL
);

CREATE INDEX crp_idx1 ON {{schema}}concept_relationship_plus(concept_id_1);

CREATE INDEX crp_idx2 ON {{schema}}concept_relationship_plus(concept_id_2);

CREATE INDEX crp_idx3 ON {{schema}}concept_relationship_plus(concept_id_1, concept_id_2);

CREATE INDEX crp_idx4 ON {{schema}}concept_relationship_plus(concept_code);

CREATE INDEX crp_idx5 ON {{schema}}concept_relationship_plus(relationship_id);

CREATE INDEX crp_idx6 ON {{schema}}concept_relationship_plus(concept_name_1);

CREATE INDEX crp_idx7 ON {{schema}}concept_relationship_plus(concept_name_2);

CREATE TABLE IF NOT EXISTS {{schema}}concept_set_json (
    codeset_id int,
    json json
);

CREATE INDEX csj_idx ON {{schema}}concept_set_json(codeset_id);
