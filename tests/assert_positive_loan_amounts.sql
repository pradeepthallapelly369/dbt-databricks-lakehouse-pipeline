-- Data Quality Test: Ensure no negative principal amounts exist in staging
select loan_id, principal_amount
from {{ ref('stg_loan_portfolio') }}
where principal_amount < 0
