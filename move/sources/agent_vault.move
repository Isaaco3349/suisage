module suisage::agent_vault {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;

    /// The vault object — holds SUI on behalf of the agent
    public struct AgentVault has key {
        id: UID,
        owner: address,
        balance: u64,
    }

    /// Events for onchain audit trail
    public struct VaultCreated has copy, drop {
        vault_id: address,
        owner: address,
    }

    public struct Deposited has copy, drop {
        vault_id: address,
        amount: u64,
        new_balance: u64,
    }

    public struct Withdrawn has copy, drop {
        vault_id: address,
        amount: u64,
        new_balance: u64,
    }

    public struct TradeSignal has copy, drop {
        vault_id: address,
        pool: vector<u8>,
        side: vector<u8>,
        price_e9: u64,
        timestamp_ms: u64,
    }

    /// Create a new agent vault
    public entry fun create_vault(ctx: &mut TxContext) {
        let vault = AgentVault {
            id: object::new(ctx),
            owner: ctx.sender(),
            balance: 0,
        };
        event::emit(VaultCreated {
            vault_id: object::uid_to_address(&vault.id),
            owner: ctx.sender(),
        });
        transfer::share_object(vault);
    }

    /// Deposit SUI into the vault
    public entry fun deposit(vault: &mut AgentVault, coin: Coin<SUI>, ctx: &mut TxContext) {
        assert!(vault.owner == ctx.sender(), 0);
        let amount = coin::value(&coin);
        vault.balance = vault.balance + amount;
        coin::put(&mut vault.id, coin);
        event::emit(Deposited {
            vault_id: object::uid_to_address(&vault.id),
            amount,
            new_balance: vault.balance,
        });
    }

    /// Withdraw SUI from the vault
    public entry fun withdraw(vault: &mut AgentVault, amount: u64, ctx: &mut TxContext) {
        assert!(vault.owner == ctx.sender(), 0);
        assert!(vault.balance >= amount, 1);
        vault.balance = vault.balance - amount;
        let coin = coin::take(&mut vault.id, amount, ctx);
        event::emit(Withdrawn {
            vault_id: object::uid_to_address(&vault.id),
            amount,
            new_balance: vault.balance,
        });
        transfer::public_transfer(coin, ctx.sender());
    }

    /// Emit a trade signal onchain (for audit trail)
    public entry fun emit_trade_signal(
        vault: &AgentVault,
        pool: vector<u8>,
        side: vector<u8>,
        price_e9: u64,
        ctx: &mut TxContext
    ) {
        assert!(vault.owner == ctx.sender(), 0);
        event::emit(TradeSignal {
            vault_id: object::uid_to_address(&vault.id),
            pool,
            side,
            price_e9,
            timestamp_ms: tx_context::epoch_timestamp_ms(ctx),
        });
    }

    /// Getters
    public fun balance(vault: &AgentVault): u64 { vault.balance }
    public fun owner(vault: &AgentVault): address { vault.owner }
}