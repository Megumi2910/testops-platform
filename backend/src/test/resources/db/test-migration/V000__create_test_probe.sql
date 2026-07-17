CREATE TABLE backbone_test_probe (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO backbone_test_probe (id) VALUES (1);
