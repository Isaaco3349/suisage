module suipilot::strategy {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// Onchain strategy configuration owned by the user
    public struct Strategy has key, store {
        id: UID,
        owner: address,
        /// Max % of vault to deploy per trade (basis points — 1000 = 10%)
        max_position_bps: u64,
        /// Stop loss in basis points below entry
        stop_loss_bps: u64,
        /// Take profit in basis points above entry
        take_profit_bps: u64,
        /// 0 = manual, 1 = momentum, 2 = mean_revert
        strategy_type: u8,
        active: bool,
    }

    public fun create(
        max_position_bps: u64,
        stop_loss_bps: u64,
        take_profit_bps: u64,
        strategy_type: u8,
        ctx: &mut TxContext
    ) {
        let strategy = Strategy {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            max_position_bps,
            stop_loss_bps,
            take_profit_bps,
            strategy_type,
            active: true,
        };
        transfer::transfer(strategy, tx_context::sender(ctx));
    }

    public fun update(
        strategy: &mut Strategy,
        max_position_bps: u64,
        stop_loss_bps: u64,
        take_profit_bps: u64,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == strategy.owner, 0);
        strategy.max_position_bps = max_position_bps;
        strategy.stop_loss_bps = stop_loss_bps;
        strategy.take_profit_bps = take_profit_bps;
    }

    public fun toggle(strategy: &mut Strategy, ctx: &TxContext) {
        assert!(tx_context::sender(ctx) == strategy.owner, 0);
        strategy.active = !strategy.active;
    }

    public fun is_active(strategy: &Strategy): bool { strategy.active }
    public fun max_position_bps(strategy: &Strategy): u64 { strategy.max_position_bps }
    public fun stop_loss_bps(strategy: &Strategy): u64 { strategy.stop_loss_bps }
    public fun take_profit_bps(strategy: &Strategy): u64 { strategy.take_profit_bps }
    public fun strategy_type(strategy: &Strategy): u8 { strategy.strategy_type }
}
