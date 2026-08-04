-- Staging model: Normalizing raw loan portfolio data
with raw_loans as (
    select
        cast(loan_id as string) as loan_id,
        cast(customer_id as string) as customer_id,
        cast(principal_amount as decimal(18, 2)) as principal_amount,
        cast(interest_rate as decimal(5, 4)) as interest_rate,
        cast(start_date as date) as loan_start_date,
        cast(term_months as int) as term_months,
        upper(trim(loan_type)) as loan_type,
        lower(trim(loan_status)) as loan_status
    from {{ source('raw_banking', 'loans') }}
)

select *
from raw_loans
where loan_id is not null
