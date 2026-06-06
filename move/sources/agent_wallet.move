module suipilot::agent_wallet {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::event;

    /// Capability granting agent authority to execute trades
    public struct AgentCap has key, store {
        id: UID,
        owner: address,
    }

    /// The agent's onchain vault holding funds for trading
    public struct AgentVault<phantom T> has key {
        id: UID,
        balance: Balance<T>,
        owner: address,
        agent: address,
        total_trades: u64,
        total_volume: u64,
    }

    /// Emitted on every trade execution
    public struct TradeExecuted has copy, drop {
        vault_id: address,
        amount: u64,
        direction: u8, // 0 = buy, 1 = sell
        timestamp: u64,
    }

    /// Create a new agent vault and return the cap to the sender
    public fun create_vault<T>(
        initial_funds: Coin<T>,
        agent_address: address,
        ctx: &mut TxContext
    ): AgentCap {
        let owner = tx_context::sender(ctx);
        let vault = AgentVault<T> {
            id: object::new(ctx),
            balance: coin::into_balance(initial_funds),
            owner,
            agent: agent_address,
            total_trades: 0,
            total_volume: 0,
        };
        transfer::share_object(vault);

        AgentCap {
            id: object::new(ctx),
            owner,
        }
    }

    /// Deposit more funds into the vault (owner only)
    public fun deposit<T>(
        vault: &mut AgentVault<T>,
        funds: Coin<T>,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.owner, 0);
        balance::join(&mut vault.balance, coin::into_balance(funds));
    }

    /// Withdraw funds (owner only)
    public fun withdraw<T>(
        vault: &mut AgentVault<T>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<T> {
        assert!(tx_context::sender(ctx) == vault.owner, 0);
        coin::from_balance(balance::split(&mut vault.balance, amount), ctx)
    }

    public fun vault_balance<T>(vault: &AgentVault<T>): u64 {
        balance::value(&vault.balance)
    }

    public fun total_trades<T>(vault: &AgentVault<T>): u64 {
        vault.total_trades
    }

    public fun total_volume<T>(vault: &AgentVault<T>): u64 {
        vault.total_volume
    }
}
