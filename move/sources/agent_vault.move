#[allow(lint(public_entry))]
module suisage::agent_vault {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;

    public struct AgentVault has key {
        id: UID,
        owner: address,
        reserve: Balance<SUI>,
    }

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

    public entry fun create_vault(ctx: &mut TxContext) {
        let vault = AgentVault {
            id: object::new(ctx),
            owner: ctx.sender(),
            reserve: balance::zero(),
        };
        event::emit(VaultCreated {
            vault_id: object::uid_to_address(&vault.id),
            owner: ctx.sender(),
        });
        transfer::share_object(vault);
    }

    public entry fun deposit(vault: &mut AgentVault, coin: Coin<SUI>, ctx: &mut TxContext) {
        assert!(vault.owner == ctx.sender(), 0);
        let amount = coin::value(&coin);
        let new_balance = balance::value(&vault.reserve) + amount;
        balance::join(&mut vault.reserve, coin::into_balance(coin));
        event::emit(Deposited {
            vault_id: object::uid_to_address(&vault.id),
            amount,
            new_balance,
        });
    }

    public entry fun withdraw(vault: &mut AgentVault, amount: u64, ctx: &mut TxContext) {
        assert!(vault.owner == ctx.sender(), 0);
        assert!(balance::value(&vault.reserve) >= amount, 1);
        let new_balance = balance::value(&vault.reserve) - amount;
        let coin = coin::from_balance(balance::split(&mut vault.reserve, amount), ctx);
        event::emit(Withdrawn {
            vault_id: object::uid_to_address(&vault.id),
            amount,
            new_balance,
        });
        transfer::public_transfer(coin, ctx.sender());
    }

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

    public fun balance(vault: &AgentVault): u64 { balance::value(&vault.reserve) }
    public fun owner(vault: &AgentVault): address { vault.owner }
}
