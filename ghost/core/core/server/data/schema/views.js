/**
 * Database VIEW definitions.
 *
 * Each key is the VIEW name. The value is the raw SQL body (everything after
 * "CREATE VIEW <name> AS"). VIEWs are created during `knex-migrator init`
 * (after all tables) and via versioned migrations for upgrades.
 */
module.exports = {
    members_resolved_subscription: `
        SELECT member_id, subscription_id
        FROM (
            SELECT
                msc.member_id,
                mscs.id as subscription_id,
                ROW_NUMBER() OVER (
                    PARTITION BY msc.member_id
                    ORDER BY
                        CASE WHEN mscs.status IN ('active', 'trialing', 'past_due', 'unpaid') THEN 0 ELSE 1 END,
                        mscs.current_period_end DESC
                ) as rn
            FROM members_stripe_customers_subscriptions mscs
            JOIN members_stripe_customers msc ON msc.customer_id = mscs.customer_id
        ) ranked
        WHERE rn = 1
    `
};
