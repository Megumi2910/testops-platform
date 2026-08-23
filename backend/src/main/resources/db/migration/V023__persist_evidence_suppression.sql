ALTER TABLE test_case_results
    ADD COLUMN IF NOT EXISTS evidence_suppressed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS evidence_suppression_reason VARCHAR(120);

-- V022 and earlier could retain an artifact or failure message captured before
-- a later step used a secret variable. Immutable execution snapshots let us
-- identify every legacy case that referenced a secret without decrypting it.
-- Suppress its evidence and replace historical failure text conservatively.
WITH legacy_secret_cases AS (
    SELECT DISTINCT case_result.id
    FROM test_case_results case_result
    JOIN execution_step_snapshots step_snapshot
      ON step_snapshot.case_result_id = case_result.id
    JOIN execution_variable_snapshots variable_snapshot
      ON variable_snapshot.execution_id = case_result.execution_id
     AND variable_snapshot.secret = TRUE
    WHERE POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.locator_value, ''))) > 0
       OR POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.input_value, ''))) > 0
       OR POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.expected_value, ''))) > 0
)
UPDATE test_case_results case_result
SET evidence_suppressed = TRUE,
    evidence_suppression_reason = 'LEGACY_SECRET_VARIABLE_REFERENCE',
    error_message = CASE
        WHEN case_result.error_message IS NULL THEN NULL
        ELSE 'Legacy failure details were redacted by secret-evidence policy'
    END
WHERE case_result.id IN (SELECT id FROM legacy_secret_cases);

WITH legacy_secret_cases AS (
    SELECT DISTINCT case_result.id
    FROM test_case_results case_result
    JOIN execution_step_snapshots step_snapshot
      ON step_snapshot.case_result_id = case_result.id
    JOIN execution_variable_snapshots variable_snapshot
      ON variable_snapshot.execution_id = case_result.execution_id
     AND variable_snapshot.secret = TRUE
    WHERE POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.locator_value, ''))) > 0
       OR POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.input_value, ''))) > 0
       OR POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.expected_value, ''))) > 0
)
UPDATE test_step_results step_result
SET error_message = 'Legacy step failure details were redacted by secret-evidence policy'
WHERE step_result.case_result_id IN (SELECT id FROM legacy_secret_cases)
  AND step_result.error_message IS NOT NULL;

WITH legacy_secret_cases AS (
    SELECT DISTINCT case_result.id, case_result.execution_id
    FROM test_case_results case_result
    JOIN execution_step_snapshots step_snapshot
      ON step_snapshot.case_result_id = case_result.id
    JOIN execution_variable_snapshots variable_snapshot
      ON variable_snapshot.execution_id = case_result.execution_id
     AND variable_snapshot.secret = TRUE
    WHERE POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.locator_value, ''))) > 0
       OR POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.input_value, ''))) > 0
       OR POSITION(UPPER('$' || '{' || variable_snapshot.variable_key || '}') IN UPPER(COALESCE(step_snapshot.expected_value, ''))) > 0
)
UPDATE execution_artifacts artifact
SET secret_suppressed = TRUE
WHERE artifact.case_result_id IN (SELECT id FROM legacy_secret_cases)
   OR (
       artifact.case_result_id IS NULL
       AND artifact.execution_id IN (SELECT execution_id FROM legacy_secret_cases)
   );

ALTER TABLE test_case_results
    ADD CONSTRAINT ck_case_result_evidence_suppression_reason
    CHECK (
        (evidence_suppressed AND evidence_suppression_reason IS NOT NULL)
        OR (NOT evidence_suppressed AND evidence_suppression_reason IS NULL)
    );
