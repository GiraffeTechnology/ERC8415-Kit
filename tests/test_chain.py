import json
from pathlib import Path

import pytest
from eth_abi import encode
from eth_tester.exceptions import TransactionFailed
from test_registry import activate, command, register
from web3 import EthereumTesterProvider, Web3

from adapters.ethereum import EthereumAdapter, L2Adapter, LocalEVMAdapter, ProjectionAdapter


def deploy(web3, name, args=()):
    artifact = json.loads(Path("contracts/out/" + name + ".json").read_text())
    factory = web3.eth.contract(abi=artifact["abi"], bytecode=artifact["evm"]["bytecode"]["object"])
    receipt = web3.eth.wait_for_transaction_receipt(
        factory.constructor(*args).transact({"from": web3.eth.accounts[0]})
    )
    assert receipt.status == 1
    return web3.eth.contract(address=receipt.contractAddress, abi=artifact["abi"])


@pytest.fixture
def chain():
    return Web3(EthereumTesterProvider())


def test_api_engine_evm_lifecycle(client, chain):
    contract = deploy(chain, "KitLifecycle")
    client.app.state.registry.adapter = LocalEVMAdapter(chain, contract, chain.eth.accounts[0])
    assert register(client).status_code == 201
    activate(client)
    assert command(client, "/settlement", 3).json()["state"] == "SETTLED"
    logs = contract.events.AssetChanged().get_logs(from_block=0)
    assert len(logs) == 4
    assert logs[-1]["args"]["state"] == 5
    assert client.get("/asset/bond/history").json()[-1]["record"]["receipt"]["finality"] == "LOCAL_EVM"


def test_workflow_freeze_revoke_and_guards(chain):
    contract = deploy(chain, "KitLifecycle")
    adapter = LocalEVMAdapter(chain, contract, chain.eth.accounts[0])
    a = {"id": "x", "holder": "h", "version": 1, "state": "REGISTERED"}
    adapter.execute("register", a)
    with pytest.raises(TransactionFailed):
        adapter.execute("register", a)
    a["version"] = 2
    adapter.execute("freeze", a)
    with pytest.raises(TransactionFailed):
        adapter.execute("settlement", {**a, "version": 3})
    adapter.execute("revoke", {**a, "version": 3})
    with pytest.raises(TransactionFailed):
        adapter.execute("freeze", {**a, "version": 4})
    with pytest.raises(ValueError):
        adapter.submit("unknown", a)
    outsider = LocalEVMAdapter(chain, contract, chain.eth.accounts[1])
    with pytest.raises(TransactionFailed):
        outsider.submit("register", {**a, "id": "other"})
    with pytest.raises(ValueError):
        EthereumAdapter(chain, contract, chain.eth.accounts[0], 1)
    external = EthereumAdapter(chain, contract, chain.eth.accounts[0], chain.eth.chain_id)
    with pytest.raises(RuntimeError):
        external.execute("register", a)


def test_transfer_and_monitor(chain):
    contract = deploy(chain, "KitLifecycle")
    adapter = LocalEVMAdapter(chain, contract, chain.eth.accounts[0])
    a = {"id": "x", "holder": "h", "version": 1, "state": "REGISTERED"}
    adapter.execute("register", a)
    adapter.execute("verify", {**a, "version": 2, "state": "VERIFIED"})
    adapter.execute("update", {**a, "version": 3, "state": "ACTIVE"})
    tx = adapter.submit("transfer", {**a, "version": 4, "state": "TRANSFERRED", "holder": "next"})
    assert adapter.monitor(tx)["finality"] == "CONFIRMED"
    l2 = L2Adapter(chain, contract, chain.eth.accounts[0], chain.eth.chain_id,
                   settlement_finality=lambda receipt: False)
    assert l2.monitor(tx)["finality"] == "PENDING_L1"
    assert adapter.monitor("0x" + "ff" * 32)["finality"] == "PENDING"


@pytest.fixture
def projection(chain):
    validators = [chain.eth.accounts[1]]
    return deploy(chain, "RegisterProjectionReference",
                  (Web3.keccak(text="register"), chain.eth.accounts[0], validators, 1))


def initialize(chain, projection):
    instant = chain.eth.get_block("latest").timestamp
    projection.functions.mint(chain.eth.accounts[2], 1, Web3.keccak(text="first"),
                              bytes(32), instant).transact({"from": chain.eth.accounts[0]})
    return instant


def open_settlement(chain, projection, name="settlement", holder=None):
    sid = Web3.keccak(text=name)
    projection.functions.beginSettlement(
        1, sid, holder or chain.eth.accounts[3], Web3.keccak(text="snapshot"),
        chain.eth.get_block("latest").timestamp + 100,
    ).transact({"from": chain.eth.accounts[0]})
    return sid


def build_proof(chain, projection, sid, commitment, effective, mutate=None, height=1):
    item = projection.functions.settlement(sid).call()
    previous = projection.functions.currentEntry(1).call()
    values = [
        projection.functions.REMOTE_ENTRY_LEAF_TYPEHASH().call(), chain.eth.chain_id,
        projection.address, 1, sid, item[2], item[3], previous[0], commitment, bytes(32),
        previous[4] + 1, effective,
    ]
    types = ["bytes32", "uint256", "address", "uint256", "bytes32", "address",
             "bytes32", "bytes32", "bytes32", "bytes32", "uint64", "uint64"]
    if mutate is not None:
        if types[mutate] == "bytes32":
            values[mutate] = Web3.keccak(text="mutated")
        elif types[mutate] == "address":
            values[mutate] = chain.eth.accounts[8]
        else:
            values[mutate] += 1
    leaf = Web3.keccak(b"\x00" + Web3.keccak(encode(types, values)))
    block_hash = Web3.keccak(text="remote-block")
    finality_struct = Web3.keccak(encode(
        ["bytes32", "bytes32", "uint64", "bytes32", "bytes32", "bytes32"],
        [projection.functions.REMOTE_FINALITY_TYPEHASH().call(),
         projection.functions.registerId().call(), height, block_hash, leaf,
         projection.functions.validatorSetHash().call()],
    ))
    digest = Web3.keccak(b"\x19\x01" + projection.functions.DOMAIN_SEPARATOR().call()
                        + finality_struct)
    key = chain.provider.ethereum_tester.backend.account_keys[1]
    signature = key.sign_msg_hash(digest).to_bytes()
    return encode(["uint64", "bytes32", "bytes32", "uint256", "bytes32[]", "bytes[]"],
                  [height, block_hash, leaf, 0, [], [signature]])


def test_projection_admission_events_finality_and_transfer(chain, projection):
    first = initialize(chain, projection)
    sid = open_settlement(chain, projection)
    projection.functions.transferFrom(chain.eth.accounts[2], chain.eth.accounts[4], 1).transact(
        {"from": chain.eth.accounts[2]}
    )
    adapter = ProjectionAdapter(projection, chain.eth.accounts[7])
    assert adapter.as_of(1, first)["holder"] == chain.eth.accounts[2]
    assert not adapter.as_of(1, first)["final"]
    commitment = Web3.keccak(text="next")
    proof = build_proof(chain, projection, sid, commitment, first + 1)
    receipt = chain.eth.wait_for_transaction_receipt(
        adapter.finalize(sid, commitment, bytes(32), first + 1, proof)
    )
    assert receipt.status == 1
    assert len(projection.events.SettlementFinalized().get_logs(from_block=receipt.blockNumber)) == 1
    assert adapter.as_of(1, first)["final"]
    assert adapter.as_of(1, first + 1)["holder"] == chain.eth.accounts[3]
    assert projection.functions.ownerOf(1).call() == chain.eth.accounts[4]
    assert projection.functions.entryAt(1, 1).call()[6] == first + 1
    with pytest.raises(TransactionFailed):
        adapter.finalize(sid, commitment, bytes(32), first + 1, proof)
    assert projection.functions.supportsInterface(bytes.fromhex("6309e170")).call()
    assert projection.functions.supportsInterface(bytes.fromhex("f4a7d71b")).call()


@pytest.mark.parametrize("field", range(1, 12))
def test_all_bound_fields_reject_tampering(chain, projection, field):
    first = initialize(chain, projection)
    sid = open_settlement(chain, projection)
    commitment = Web3.keccak(text="next")
    proof = build_proof(chain, projection, sid, commitment, first + 1, mutate=field)
    with pytest.raises(TransactionFailed):
        ProjectionAdapter(projection, chain.eth.accounts[7]).finalize(
            sid, commitment, bytes(32), first + 1, proof
        )
    assert projection.functions.entryCount(1).call() == 1
    assert projection.functions.openGapOf(1).call() == sid


def test_authority_cancellation_and_confirming_entry(chain, projection):
    first = initialize(chain, projection)
    assert not projection.functions.isFinalAsOf(1, first - 1).call()
    with pytest.raises(TransactionFailed):
        projection.functions.entryAsOf(1, first - 1).call()
    assert not projection.functions.isSettlementAuthority(1, chain.eth.accounts[2]).call()
    sid = open_settlement(chain, projection, holder=chain.eth.accounts[2])
    with pytest.raises(TransactionFailed):
        projection.functions.cancelSettlement(sid, bytes(32)).transact(
            {"from": chain.eth.accounts[0]}
        )
    commitment = Web3.keccak(text="confirm")
    proof = build_proof(chain, projection, sid, commitment, first + 1)
    ProjectionAdapter(projection, chain.eth.accounts[7]).finalize(
        sid, commitment, bytes(32), first + 1, proof
    )
    assert projection.functions.isFinalAsOf(1, first).call()
    assert projection.functions.holderAsOf(1, first + 1).call() == chain.eth.accounts[2]
    second = open_settlement(chain, projection, name="second")
    deadline = projection.functions.settlement(second).call()[5]
    chain.provider.ethereum_tester.time_travel(deadline + 1)
    projection.functions.cancelSettlement(second, bytes(32)).transact(
        {"from": chain.eth.accounts[0]}
    )
    assert projection.functions.entryCount(1).call() == 2
    assert projection.functions.openGapOf(1).call() == bytes(32)
