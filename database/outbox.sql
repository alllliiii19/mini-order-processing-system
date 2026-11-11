
CREATE TABLE IF NOT EXISTS outbox_events (

    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    event_type VARCHAR(100) NOT NULL,

    aggregate_id BIGINT NOT NULL,

    payload JSONB NOT NULL,

    published_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
ON outbox_events(id)
WHERE published_at IS NULL;
