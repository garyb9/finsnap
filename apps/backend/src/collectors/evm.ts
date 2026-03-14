import { createPublicClient, http, formatEther, formatGwei, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import type { Config } from '../config';
import type { Collector, CollectorState, BlockData, WhaleTransfer } from './types';
import { createLogger } from '../logger';

const log = createLogger('evm');

const CHAIN_ID = 1; // Ethereum mainnet

export class EvmCollector implements Collector {
  readonly name = 'evm';

  private client: PublicClient;
  private blocks: BlockData[] = [];
  private unwatch: (() => void) | null = null;
  private whaleThresholdWei: bigint;
  private chainId: number = CHAIN_ID;

  get blockCount(): number {
    return this.blocks.length;
  }

  constructor(private config: Config) {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(config.ethRpcUrl),
    });
    this.whaleThresholdWei = BigInt(Math.floor(config.whaleThresholdEth * 1e18));
  }

  async start(): Promise<void> {
    this.chainId = await this.client.getChainId();
    log.info(`connected to chain ${this.chainId}, watching blocks...`);

    this.unwatch = this.client.watchBlocks({
      onBlock: async (block) => {
        try {
          await this.processBlock(block.number!);
        } catch (err) {
          log.error(`error processing block ${block.number}: ${err}`);
        }
      },
    });
  }

  stop(): void {
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
    log.info('stopped watching blocks');
  }

  async backfill(count: number): Promise<void> {
    const latest = await this.client.getBlockNumber();
    const from = latest - BigInt(count - 1);

    log.info(`backfilling ${count} blocks (${from} → ${latest})...`);

    for (let n = from; n <= latest; n++) {
      await this.processBlock(n);
    }

    log.info(`backfill complete — ${this.blocks.length} blocks in buffer`);
  }

  drain(windowMs: number): CollectorState {
    const cutoff = Date.now() - windowMs;
    const relevant = this.blocks.filter((b) => b.timestamp * 1000 >= cutoff);

    // Flush old data
    this.blocks = this.blocks.filter((b) => b.timestamp * 1000 >= cutoff);

    return {
      blocks: relevant,
      startTime: relevant.length > 0 ? relevant[0].timestamp : Math.floor(cutoff / 1000),
      endTime:
        relevant.length > 0
          ? relevant[relevant.length - 1].timestamp
          : Math.floor(Date.now() / 1000),
      chainId: this.chainId,
    };
  }

  private async processBlock(blockNumber: bigint): Promise<void> {
    const block = await this.client.getBlock({
      blockNumber,
      includeTransactions: true,
    });

    const whaleTransfers: WhaleTransfer[] = [];
    let totalValueWei = 0n;

    for (const tx of block.transactions) {
      if (typeof tx === 'string') continue;

      const value = tx.value ?? 0n;
      totalValueWei += value;

      if (value >= this.whaleThresholdWei) {
        whaleTransfers.push({
          hash: tx.hash,
          from: tx.from,
          to: tx.to ?? '0x0',
          valueEth: parseFloat(formatEther(value)),
          blockNumber: block.number,
          timestamp: Number(block.timestamp),
        });
      }
    }

    let baseFeeGwei = 0;
    if (block.baseFeePerGas) {
      baseFeeGwei = parseFloat(formatGwei(block.baseFeePerGas));
    } else {
      try {
        const gasPrice = await this.client.getGasPrice();
        baseFeeGwei = parseFloat(formatGwei(gasPrice));
        log.warn(`block ${block.number}: baseFeePerGas missing, using gasPrice fallback`);
      } catch (err) {
        log.warn(`block ${block.number}: failed to fetch gas price fallback: ${err}`);
      }
    }

    const blockData: BlockData = {
      number: block.number,
      timestamp: Number(block.timestamp),
      baseFeeGwei,
      gasUsed: block.gasUsed,
      gasLimit: block.gasLimit,
      transactionCount: block.transactions.length,
      totalValueEth: parseFloat(formatEther(totalValueWei)),
      whaleTransfers,
    };

    this.blocks.push(blockData);

    if (whaleTransfers.length > 0) {
      log.info(
        `block ${block.number}: ${whaleTransfers.length} whale transfer(s), ` +
          `${blockData.totalValueEth.toFixed(2)} ETH total`
      );
    }
  }
}
