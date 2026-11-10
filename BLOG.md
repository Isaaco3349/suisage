# Teaching a DeFi agent to unlearn

Most AI with memory demos only ever add to the pile. That is a trap for finance. A lesson like buying in a tight market worked is true until the market proves otherwise, and an agent that cannot retire it keeps repeating the mistake.

SuiSage Recall is a DeFi copilot on Sui DeepBook that treats memory as something with a lifecycle of learn, confirm and overturn. It was built for the Tatum and Walrus Memory hackathon.

## What it does

You ask for a signal. The agent reads live DeepBook orderbooks, reads the wallet through the Tatum Sui RPC gateway, and recalls what it learned before from Walrus Memory on mainnet. It answers and cites the memory ids that influenced the answer. Every signal is anchored to a Sui checkpoint fetched through Tatum.

Later the signal is graded against the price move. The outcome is written to Walrus Memory as a lesson that records the setup, what happened and when. If a new lesson contradicts an older one for the same setup, the agent writes a superseding memory that points at the old one. The old lesson is struck through in the interface and left out of future recall.

## How it uses Walrus Memory

Recall in Walrus Memory is semantic, so each memory is a sentence plus a json line. The sentence is what search matches and the json is what the code parses. Three kinds exist. A signal records what the agent decided and which memories it used. A lesson records the graded outcome. A superseding memory says an older lesson is overturned. At recall time the agent fetches lessons and superseding memories together and filters out anything retired. The Memory Diff button runs one question twice, with memory off and on, so the difference is visible on one screen.

## How it uses Tatum

All Sui reads go through the Tatum gateway. That covers the wallet balance, recent outgoing transactions, and the latest checkpoint with its timestamp, which anchors each signal and grade to chain time. One small module is the only place that talks to the network.

## How it learned over time

Describe your own run here after seeding. Say how many signals you ran, which lessons were confirmed, which were overturned, and give one concrete example where the answer changed because of a stored memory, including the memory ids. Say which lessons came from simulated price moves and which came from real moves.

## What comes next

Pay per call risk reports over x402 on Sui, with the agent remembering which paid sources were worth the money, and a second agent that inherits the first agent's lessons.
