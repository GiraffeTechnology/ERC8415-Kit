# Adapter provider binding correction

The contract must use the exact monitored Web3 instance. Provider, chain, contract and address
are pinned and rechecked before submission and monitoring. The actual transaction function's
provider/address is checked immediately before transact.

Five negative tests cover mismatched initial providers, provider replacement, contract replacement,
chain-ID change and function-provider substitution. Forbidden HTTP providers raise if called;
all cases reject before network access. LocalEVMAdapter still accepts only EthereumTesterProvider.

Cumulative abcdyi regression: 88 passed, 98.75% Python coverage; lint passed.
These are direct tests, not GitHub CI evidence. CI and final merges belong to the control task.
