-- Staging model: Normalizing raw banking transaction QVD extracts
with raw_source as (
    select
        cast(transaction_id as string) as transaction_id,
        cast(account_id as string) as account_id,
        cast(customer_id as string) as customer_id,
        cast(amount as decimal(18, 2)) as transaction_amount,
        upper(trim(currency)) as currency_code,
        cast(transaction_timestamp as timestamp) as transaction_at,
        lower(trim(status)) as transaction_status
    from {{ source('raw_banking', 'transactions') }}
)

select *
from raw_source
where transaction_id is not null
