# 🔷 DBT + Databricks Data Pipeline

> A production-style ELT pipeline built with **dbt (Data Build Tool)** and **Databricks**, demonstrating the modular analytics engineering pattern used in the **Qlik-to-Databricks SQL migration** I lead at IFINGlobal Group.

[![dbt](https://img.shields.io/badge/dbt-FF694B?style=flat&logo=dbt&logoColor=white)](https://www.getdbt.com/)
[![Databricks](https://img.shields.io/badge/Databricks-FF3621?style=flat&logo=databricks&logoColor=white)](https://databricks.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)](https://python.org/)
[![DuckDB](https://img.shields.io/badge/DuckDB-FFF000?style=flat&logo=duckdb&logoColor=black)](https://duckdb.org/)

---

## 🏗️ Architecture

```
Source Data (Qlik Load Scripts / Raw Tables)
        │
        ▼
   ┌─────────┐
   │  Seeds  │  ← Static reference / lookup tables
   └─────────┘
        │
        ▼
   ┌──────────────┐
   │   Staging    │  ← Raw → typed, renamed, light transforms
   └──────────────┘
        │
        ▼
   ┌──────────────────┐
   │  Intermediate    │  ← Business logic, joins, aggregations
   └──────────────────┘
        │
        ▼
   ┌──────────┐
   │  Marts   │  ← Final reporting layer (fact/dimension tables)
   └──────────┘
        │
        ▼
   Data Quality Tests → Snapshots (SCD tracking)
```

---

## 📁 Project Structure

```
dbt_databricks11/
├── models/
│   └── example/          # Staging & mart SQL models
├── seeds/                # Static CSV reference data
├── snapshots/            # Slowly Changing Dimension tracking
├── tests/                # Custom data quality tests
├── macros/               # Reusable Jinja macros
├── analyses/             # Ad-hoc analytical SQL queries
├── dbt_project.yml       # Project configuration
├── packages.yml          # dbt package dependencies
└── profiles.yml          # Connection profiles (Databricks / DuckDB)
```

---

## 🎯 What This Demonstrates

| Capability | Implementation |
|---|---|
| **Modular SQL modeling** | Staging → Intermediate → Mart layering |
| **Data quality enforcement** | Schema tests: `not_null`, `unique`, `accepted_values`, `relationships` |
| **SCD tracking** | dbt Snapshots for slowly changing dimensions |
| **Incremental loads** | Incremental materialization strategies |
| **Local dev / cloud parity** | DuckDB for local, Databricks for production |
| **Migration pattern** | Converting Qlik load scripts into structured dbt SQL models |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- `dbt-core` + adapter (`dbt-databricks` or `dbt-duckdb`)
- Databricks workspace (or local DuckDB for development)

### Install
```bash
# Create virtual environment
python -m venv dbt-venv
source dbt-venv/bin/activate  # Windows: dbt-venv\Scripts\activate

# Install dbt with adapters
pip install dbt-core dbt-databricks dbt-duckdb
```

### Run the pipeline
```bash
# Install dbt packages
dbt deps

# Seed reference data
dbt seed

# Run all models
dbt run

# Execute data quality tests
dbt test

# Run snapshots
dbt snapshot

# Generate & serve documentation
dbt docs generate
dbt docs serve
```

### Run a specific model
```bash
# Run single model
dbt run --select model_name

# Run model and all downstream dependencies
dbt run --select model_name+

# Run with full refresh (reprocess all data)
dbt run --full-refresh
```

---

## 🧰 Tech Stack

| Tool | Role |
|---|---|
| **dbt-core** | Transformation framework — SQL model orchestration |
| **Databricks** | Cloud lakehouse — production execution layer |
| **DuckDB** | Local development adapter — fast, in-process OLAP |
| **Python** | Scripting, virtual environment, package management |
| **SQL** | Core transformation language (Jinja-templated) |
| **Git / GitHub** | Version control, code review, migration governance |

---

## 📊 Context: Real-World Migration Pattern

This repo reflects the technical approach used in the **Qlik-to-Databricks SQL migration** at IFINGlobal Group:

1. **Convert** Qlik load scripts (QVS/QVD logic) → structured dbt SQL models
2. **Validate** business logic using dbt schema tests + AI-agent reconciliation
3. **Layer** data into staging → intermediate → mart for clean separation of concerns
4. **Govern** changes via Git-based version control with Agile sprint delivery

---

## 📄 Related Certifications

- 🏅 **Databricks Fundamentals** — Academy Accreditation (2025)
- 🏅 **Qlik Sense Data Architect Qualification** (2025)
- 🏅 **Generative AI Fundamentals** — Academy Accreditation (2025)

---

## 👤 Author

**Pradeep Thallapelly** — Senior BI Developer | Data Engineer | Technical Lead
- 🔗 [LinkedIn](https://linkedin.com/in/pradeep-thallapelly-890b17312)
- 📧 [pradeep.thallapelly369@outlook.com](mailto:pradeep.thallapelly369@outlook.com)
- 🐙 [github.com/depradeep64](https://github.com/depradeep64)
