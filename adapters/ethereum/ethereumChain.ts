import type { JsonRpcTransport } from './transport.ts';
import type { RemoteChainAdapter } from '../../engine/ports.ts';
import type { TokenId } from '../../engine/projection/types.ts';

export interface EthereumChainOptions {
  readonly transport: JsonRpcTransport;
  readonly chainId: bigint;
  readonly contract: string;
}

/**
 * The chain a register is projected from, behind the same port the memory
 * adapter implements.
 *
 * Finality here is the chain's own finalized head, and it answers exactly one
 * question: may a proof claiming this height be considered against accepted
 * remote state. It is not the projection's finality, which is the
 * later-admission rule and lives in the kernel. Block depth never finalises an
 * instant.
 *
 * `refresh` is the monitoring step: it pulls the finalized head and its state
 * root. Callers drive it; nothing here polls on its own.
 */
export class EthereumChainAdapter implements RemoteChainAdapter {
  readonly chainId: bigint;
  readonly contract: string;
  readonly #transport: JsonRpcTransport;
  readonly #roots = new Map<string, string>();
  readonly #heights = new Map<string, bigint>();
  #finalizedHeight = 0n;

  constructor(options: EthereumChainOptions) {
    this.chainId = options.chainId;
    this.contract = options.contract;
    this.#transport = options.transport;
  }

  get finalizedHeight(): bigint {
    return this.#finalizedHeight;
  }

  /** Pull the finalized head and record its state root. */
  async refresh(): Promise<bigint> {
    const block = await this.#transport.send({ method: 'eth_getBlockByNumber', params: ['finalized', false] });
    if (typeof block !== 'object' || block === null) {
      throw new Error('eth_getBlockByNumber returned no block');
    }
    const { number, stateRoot } = block as { number?: unknown; stateRoot?: unknown };
    if (typeof number !== 'string' || typeof stateRoot !== 'string') {
      throw new Error('finalized block is missing number or stateRoot');
    }
    const height = BigInt(number);
    // The finalized head never moves backwards. If a node reports that it did,
    // the honest response is to refuse it rather than accept a rewind.
    if (height < this.#finalizedHeight) {
      throw new Error(`finalized head moved backwards: ${height} < ${this.#finalizedHeight}`);
    }
    this.#finalizedHeight = height;
    this.#roots.set(height.toString(), stateRoot.toLowerCase());
    return height;
  }

  isFinalized(height: bigint): boolean {
    return height > 0n && height <= this.#finalizedHeight;
  }

  stateRootAt(height: bigint): string | undefined {
    return this.#roots.get(height.toString());
  }

  acceptedHeight(tokenId: TokenId): bigint {
    return this.#heights.get(tokenId.toString()) ?? 0n;
  }

  advanceHeight(tokenId: TokenId, height: bigint): void {
    const current = this.acceptedHeight(tokenId);
    if (height <= current) {
      throw new Error(`accepted height must advance: ${height} <= ${current}`);
    }
    this.#heights.set(tokenId.toString(), height);
  }
}
