-- Ephemeral intermediate model joining loan portfolio with risk seed data
with loans as (
    select * from {{ ref('stg_loan_portfolio') }}
),

risk_tiers as (
    select * from {{ ref('seed_risk_classification') }}
)

select
    l.loan_id,
    l.customer_id,
    l.principal_amount,
    l.interest_rate,
    l.loan_type,
    l.loan_status,
    r.risk_category,
    r.weighted_risk_score
from loans l
left join risk_tiers r
    on l.loan_type = r.loan_type
