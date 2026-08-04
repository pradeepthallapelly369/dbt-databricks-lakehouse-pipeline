#!/usr/bin/env bash
# Automated dbt Databricks Orchestration Script

set -e

echo "🚀 Starting dbt Databricks Lakehouse Pipeline..."

# 1. Load Seed Data
echo "🌱 Seeding Static Lookup Tables..."
dbt seed --select seed_risk_classification

# 2. Run dbt Transformation Models (Staging -> Ephemeral -> Gold Delta)
echo "⚡ Building dbt Transformations..."
dbt run

# 3. Execute Data Quality Tests
echo "🧪 Running Data Quality Test Suites..."
dbt test

# 4. Trigger AI Data Reconciliation Agent
echo "🤖 Running AI Data Reconciliation Agent..."
python3 scripts/ai_reconciliation_agent.py

echo "✅ Pipeline Orchestration Completed Successfully!"
