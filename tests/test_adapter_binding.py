import pytest
from test_chain import deploy
from web3 import EthereumTesterProvider, HTTPProvider, Web3

from adapters.ethereum import EthereumAdapter, LocalEVMAdapter


class NoNetwork(HTTPProvider):
    def make_request(self, method, params):
        raise AssertionError("A forbidden network request occurred")


def test_mismatched_contract_provider_rejected_before_rpc():
    local = Web3(EthereumTesterProvider())
    remote = Web3(NoNetwork("https://unreachable.invalid"))
    contract = remote.eth.contract(abi=[], address="0x" + "01" * 20)
    with pytest.raises(ValueError, match="bound"):
        LocalEVMAdapter(local, contract, local.eth.accounts[0])
    with pytest.raises(TypeError):
        LocalEVMAdapter(remote, contract, "0x" + "02" * 20)


def test_provider_replacement_rejected_before_submit_or_monitor():
    local = Web3(EthereumTesterProvider())
    contract = deploy(local, "KitLifecycle")
    adapter = LocalEVMAdapter(local, contract, local.eth.accounts[0])
    local.provider = NoNetwork("https://unreachable.invalid")
    with pytest.raises(ValueError, match="binding"):
        adapter.submit("register", {"id": "x", "holder": "h", "version": 1})
    with pytest.raises(ValueError, match="binding"):
        adapter.monitor("0x" + "00" * 32)


def test_contract_replacement_rejected():
    local = Web3(EthereumTesterProvider())
    contract = deploy(local, "KitLifecycle")
    adapter = LocalEVMAdapter(local, contract, local.eth.accounts[0])
    remote = Web3(NoNetwork("https://unreachable.invalid"))
    adapter.contract = remote.eth.contract(abi=contract.abi, address=contract.address)
    with pytest.raises(ValueError, match="binding"):
        adapter.submit("register", {"id": "x", "holder": "h", "version": 1})


def test_chain_identity_change_rejected(monkeypatch):
    local = Web3(EthereumTesterProvider())
    contract = deploy(local, "KitLifecycle")
    adapter = EthereumAdapter(local, contract, local.eth.accounts[0], local.eth.chain_id)
    monkeypatch.setattr(type(local.eth), "chain_id", property(lambda self: 999))
    with pytest.raises(ValueError, match="chain identity"):
        adapter.submit("register", {"id": "x", "holder": "h", "version": 1})

def test_transaction_function_provider_rejected(monkeypatch):
    from types import SimpleNamespace

    local = Web3(EthereumTesterProvider())
    contract = deploy(local, "KitLifecycle")
    adapter = LocalEVMAdapter(local, contract, local.eth.accounts[0])
    remote = Web3(NoNetwork("https://unreachable.invalid"))
    function = SimpleNamespace(w3=remote, address=contract.address)
    monkeypatch.setattr(contract.functions, "registerAsset", lambda *args: function)
    with pytest.raises(ValueError, match="function provider"):
        adapter.submit("register", {"id": "x", "holder": "h", "version": 1})
