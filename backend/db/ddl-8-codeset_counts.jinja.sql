-- Table: codeset_counts -----------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS {{schema}}codeset_counts{{optional_suffix}};

CREATE TABLE {{schema}}codeset_counts{{optional_suffix}} AS
SELECT codeset_id, JSON_OBJECT_AGG(grp, cnt) AS counts FROM {{schema}}members_items_summary GROUP BY codeset_id;

CREATE INDEX IF NOT EXISTS csc1 on {{schema}}codeset_counts{{optional_suffix}}(codeset_id);