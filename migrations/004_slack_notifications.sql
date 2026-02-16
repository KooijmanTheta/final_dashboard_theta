CREATE SCHEMA IF NOT EXISTS tracking;

-- Slack notification log for dedup, audit trail, and escalation
CREATE TABLE IF NOT EXISTS tracking.slack_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type VARCHAR(50) NOT NULL,  -- 'overdue', 'digest', 'received', 'standardized'
  vehicle_id VARCHAR(255),
  quarter VARCHAR(20),
  deliverable VARCHAR(50),
  days_overdue INT,
  message_payload JSONB,
  http_status INT,
  error_message TEXT,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_notif_dedup
  ON tracking.slack_notifications(notification_type, vehicle_id, quarter, deliverable);
CREATE INDEX IF NOT EXISTS idx_slack_notif_sent
  ON tracking.slack_notifications(sent_at);

-- Snapshot table for change detection (received / standardized transitions)
CREATE TABLE IF NOT EXISTS tracking.monitoring_snapshot (
  vehicle_id VARCHAR(255) NOT NULL,
  quarter VARCHAR(20) NOT NULL,
  has_portfolio BOOLEAN DEFAULT FALSE,
  has_standardized BOOLEAN DEFAULT FALSE,
  has_financials BOOLEAN DEFAULT FALSE,
  has_lp_update BOOLEAN DEFAULT FALSE,
  snapshot_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (vehicle_id, quarter)
);
