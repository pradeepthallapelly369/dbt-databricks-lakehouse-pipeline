#!/usr/bin/env python3
"""
AI Data Reconciliation Agent
Compares legacy Qlik QVD / SQL output tables against dbt Databricks Gold Delta tables.
Uses OpenRouter API to automatically explain variance root-causes.
"""

import os
import json
import requests

def reconcile_data_tables(legacy_count: int, dbt_count: int, legacy_sum: float, dbt_sum: float):
    variance_count = abs(legacy_count - dbt_count)
    variance_sum = abs(legacy_sum - dbt_sum)

    print(f"==================================================")
    print(f"📊 DATA RECONCILIATION SUMMARY REPORT")
    print(f"==================================================")
    print(f"Legacy Qlik Row Count : {legacy_count:,}")
    print(f"dbt Gold Row Count     : {dbt_count:,}")
    print(f"Row Count Variance     : {variance_count:,}")
    print(f"--------------------------------------------------")
    print(f"Legacy Qlik Total Sum  : £{legacy_sum:,.2f}")
    print(f"dbt Gold Total Sum     : £{dbt_sum:,.2f}")
    print(f"Monetary Variance      : £{variance_sum:,.2f}")
    print(f"==================================================")

    if variance_count == 0 and variance_sum == 0:
        print("✅ RECONCILIATION SUCCESSFUL: Zero Variance Detected.")
        return

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if not openrouter_key:
        print("ℹ️ Set OPENROUTER_API_KEY to enable AI automated variance analysis.")
        return

    prompt = f"""
    You are an expert Data Reconciliation AI Agent. Analyze this mismatch between a legacy Qlik Sense ETL model and a target dbt Databricks Lakehouse model:
    - Legacy Qlik Rows: {legacy_count}, Sum: £{legacy_sum}
    - dbt Databricks Rows: {dbt_count}, Sum: £{dbt_sum}
    - Variance: {variance_count} rows, £{variance_sum} monetary diff.

    Provide 3 potential technical root causes (e.g. timezone mismatch, null handling in WHERE clause, duplicate join keys) and suggested fixes in dbt SQL.
    """

    headers = {
        "Authorization": f"Bearer {openrouter_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "meta-llama/llama-3.3-70b-instruct",
        "messages": [{"role": "user", "content": prompt}]
    }

    try:
        resp = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
        if resp.status_code == 200:
            analysis = resp.json()['choices'][0]['message']['content']
            print("\n🤖 AI VARIANCE DIAGNOSTIC REPORT:\n")
            print(analysis)
    except Exception as e:
        print(f"Error calling AI Reconciliation API: {e}")

if __name__ == "__main__":
    # Test execution simulating zero-variance target reconciliation
    reconcile_data_tables(legacy_count=154200, dbt_count=154200, legacy_sum=12450890.50, dbt_sum=12450890.50)
