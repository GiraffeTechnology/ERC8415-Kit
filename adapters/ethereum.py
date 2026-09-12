"""EVM transport with explicit transaction monitoring and no embedded signing keys."""
from typing import Protocol

from web3 import Web3
from web3.exceptions import TransactionNotFound

STATES = {"REGISTERED": 1, "VERIFIED": 2, "ACTIVE": 3,
          "TRANSFERRED": 4, "SETTLED": 5, "REVOKED": 6}


class PermissionedTransport(Protocol):
    """Permissioned integrations must provide submission and finality evidence."""

    def submit(self, operation: str, asset: dict) -> str: ...
    def monitor(self, transaction_id: str) -> dict: ...


class EthereumAdapter:
    mode = "ethereum"

    def __init__(self, web3, contract, sender, chain_id, confirmations=1):
        if contract.w3 is not web3:
            raise ValueError("Contract must be bound to the monitored Web3 instance")
        if web3.eth.chain_id != chain_id or confirmations < 1:
            raise ValueError("Invalid chain or confirmation policy")
        self.web3 = web3
        self.contract = contract
        self.sender = sender
        self.confirmations = confirmations
        self._provider = web3.provider
        self._chain_id = chain_id
        self._contract = contract
        self._address = contract.address

    def _validate_binding(self):
        if (self.contract is not self._contract or self.contract.w3 is not self.web3
                or self.web3.provider is not self._provider
                or self.contract.address != self._address):
            raise ValueError("Adapter provider or contract binding changed")
        if self.web3.eth.chain_id != self._chain_id:
            raise ValueError("Adapter chain identity changed")

    def submit(self, operation, asset):
        self._validate_binding()
        key = Web3.keccak(text=asset["id"])
        holder = Web3.keccak(text=asset["holder"])
        functions = self.contract.functions
        version = asset["version"] - 1
        if operation == "register":
            call = functions.registerAsset(key, holder)
        elif operation in {"verify", "update", "transfer"}:
            call = functions.updateState(key, version, STATES[asset["state"]], holder)
        elif operation == "freeze":
            call = functions.freezeAsset(key, version)
        elif operation == "revoke":
            call = functions.revokeAsset(key, version)
        elif operation == "settlement":
            call = functions.settleAsset(key, version)
        else:
            raise ValueError("Unsupported adapter operation")
        self._validate_binding()
        if call.w3 is not self.web3 or call.address != self._address:
            raise ValueError("Transaction function provider binding changed")
        return call.transact({"from": self.sender}).to_0x_hex()

    def monitor(self, transaction_id):
        self._validate_binding()
        try:
            receipt = self.web3.eth.get_transaction_receipt(transaction_id)
        except TransactionNotFound:
            return {"transaction_id": transaction_id, "finality": "PENDING", "mode": self.mode}
        canonical = self.web3.eth.get_block(receipt.blockNumber).hash == receipt.blockHash
        depth = self.web3.eth.block_number - receipt.blockNumber + 1
        status = ("REORGED" if not canonical else "FAILED" if receipt.status != 1
                  else "CONFIRMED" if depth >= self.confirmations else "PENDING")
        return {"transaction_id": transaction_id, "finality": status, "mode": self.mode,
                "block_number": receipt.blockNumber, "block_hash": receipt.blockHash.to_0x_hex(),
                "confirmations": depth}

    def execute(self, operation, asset):
        # Synchronous execution is safe ONLY for an isolated, disposable local EVM.
        # Durable external execution must use an outbox/reconciliation worker.
        if self.mode != "local-evm":
            raise RuntimeError("External execution requires a durable outbox")
        transaction_id = self.submit(operation, asset)
        result = self.monitor(transaction_id)
        if result["finality"] != "CONFIRMED":
            raise RuntimeError("Local transaction did not confirm")
        result["finality"] = "LOCAL_EVM"
        return result


class LocalEVMAdapter(EthereumAdapter):
    mode = "local-evm"

    def __init__(self, web3, contract, sender):
        from web3.providers.eth_tester import EthereumTesterProvider

        if not isinstance(web3.provider, EthereumTesterProvider):
            raise TypeError("Local EVM adapter requires an in-process test provider")
        super().__init__(web3, contract, sender, web3.eth.chain_id)


class L2Adapter(EthereumAdapter):
    mode = "l2"

    def __init__(self, *args, settlement_finality, **kwargs):
        super().__init__(*args, **kwargs)
        self.settlement_finality = settlement_finality

    def monitor(self, transaction_id):
        result = super().monitor(transaction_id)
        if result["finality"] == "CONFIRMED" and not self.settlement_finality(result):
            result["finality"] = "PENDING_L1"
        return result


class ProjectionAdapter:
    """ERC-8415 projection queries and proof admission, distinct from workflow state."""

    def __init__(self, contract, sender):
        self.contract = contract
        self.sender = sender

    def as_of(self, token_id, instant):
        f = self.contract.functions
        return {"holder": f.holderAsOf(token_id, instant).call(),
                "final": f.isFinalAsOf(token_id, instant).call(),
                "open_gap": f.openGapOf(token_id).call().hex()}

    def finalize(self, settlement_id, commitment, reference, effective_at, proof):
        return self.contract.functions.finalizeSettlement(
            settlement_id, commitment, reference, effective_at, proof
        ).transact({"from": self.sender})
