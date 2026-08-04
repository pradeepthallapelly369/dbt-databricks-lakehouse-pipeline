-- Gold Layer Fact Table: Materialized as Delta Table on Databricks
{{ config(
    materialized='table',
    file_format='delta',
    partition_by=['transaction_date']
) }}

with transactions as (
    select * from {{ ref('stg_banking_transactions') }}
),

daily_agg as (
    select
        cast(transaction_at as date) as transaction_date,
        customer_id,
        count(transaction_id) as total_transactions,
        sum(case when transaction_status = 'completed' then transaction_amount else 0 end) as total_completed_amount,
        sum(case when transaction_status = 'failed' then transaction_amount else 0 end) as total_failed_amount
    from transactions
    group by 1, 2
)

select
    md5(concat(cast(transaction_date as string), customer_id)) as daily_summary_key,
    transaction_date,
    customer_id,
    total_transactions,
    total_completed_amount,
    total_failed_amount,
    current_timestamp() as dbt_updated_at
from daily_agg
