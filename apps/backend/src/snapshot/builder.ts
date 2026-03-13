import { ulid } from 'ulid';
import { minutesToMilliseconds } from 'date-fns';
import type Redis from 'ioredis';
import type { Config } from '../config';
import { createLogger } from '../logger';
import type { EvmCollector } from '../collectors/evm';
import { fetchOptionsData } from '../collectors/options';
import {
  analyzeWhales,
  analyzeGas,
  analyzeVolume,
  computeNetworkStress,
} from '../analyzers/onchain';
import { analyzeOptionsChain } from '../analyzers/options';
import type { FinSnap, SnapWhaleTransfer } from './types';

const log = createLogger('builder');

const SNAP_WINDOW_MS = minutesToMilliseconds(10);

export class SnapBuilder {
  constructor(
    private evmCollector: EvmCollector,
    private config: Config,
    private redis: Redis
  ) {}

  async build(): Promise<FinSnap> {
    log.info('building snap...');

    // 1. Drain EVM collector
    const evmState = this.evmCollector.drain(SNAP_WINDOW_MS);
    const latestBlock = evmState.blocks.at(-1);

    // 2. Fetch options for all tickers in parallel
    const equityResults = await Promise.allSettled(
      this.config.tickerList.map((ticker) =>
        fetchOptionsData(ticker, this.redis).then((data) => ({ ticker, data }))
      )
    );

    // 3. Analyze on-chain
    const whaleAnalysis = analyzeWhales(evmState);
    const gasAnalysis = analyzeGas(evmState);
    const volumeAnalysis = analyzeVolume(evmState);
    const networkStress = computeNetworkStress(gasAnalysis, whaleAnalysis, volumeAnalysis);

    log.info(
      `on-chain: ${evmState.blocks.length} blocks, ` +
        `gas ${gasAnalysis.avgBaseFeeGwei.toFixed(1)} gwei (${gasAnalysis.trend}), ` +
        `whales ${whaleAnalysis.totalWhaleTransfers}, stress ${networkStress}`
    );

    // 4. Analyze options per ticker
    const equities: FinSnap['equities'] = {};
    for (const result of equityResults) {
      if (result.status === 'rejected') {
        log.warn(`options fetch rejected: ${result.reason}`);
        continue;
      }
      const { ticker, data } = result.value;
      if (!data) {
        log.warn(`${ticker}: options data unavailable`);
        continue;
      }
      const analysis = analyzeOptionsChain(data);
      equities[ticker] = {
        price: data.price,
        expirations: analysis.expirations,
      };
    }

    // 5. Assemble FinSnap — all BigInt fields converted to number for JSON safety
    const blockHeight = latestBlock ? Number(latestBlock.number) : 0;

    const transfers: SnapWhaleTransfer[] = evmState.blocks
      .flatMap((b) => b.whaleTransfers)
      .map((t) => ({
        hash: t.hash,
        from: t.from,
        to: t.to,
        valueEth: t.valueEth,
        blockNumber: Number(t.blockNumber),
        timestamp: t.timestamp,
      }));

    const snap: FinSnap = {
      id: ulid(),
      timestamp: new Date().toISOString(),
      blockHeight,
      version: '1.0',
      onChain: {
        whale: {
          count: whaleAnalysis.totalWhaleTransfers,
          totalValueEth: Math.round(whaleAnalysis.totalWhaleVolumeEth * 100) / 100,
          transfers,
          energyScore: Math.round(whaleAnalysis.whaleEnergy),
        },
        gas: {
          averageGwei: Math.round(gasAnalysis.avgBaseFeeGwei * 10) / 10,
          trend: gasAnalysis.trend,
          congestionScore: Math.round(gasAnalysis.networkStress),
        },
        volume: {
          txCount: volumeAnalysis.totalTransactions,
          totalValueEth: Math.round(volumeAnalysis.totalVolumeEth * 100) / 100,
          intensityScore: Math.round(volumeAnalysis.intensity),
        },
        networkStress,
      },
      equities,
      signals: {
        networkStress,
        whaleEnergy: Math.round(whaleAnalysis.whaleEnergy),
        volumeIntensity: Math.round(volumeAnalysis.intensity),
        gasCongestion: Math.round(gasAnalysis.networkStress),
        overallSentiment: Math.round(
          (networkStress +
            whaleAnalysis.whaleEnergy +
            volumeAnalysis.intensity +
            gasAnalysis.networkStress) /
            4
        ),
      },
    };

    log.info(
      `snap ${snap.id} built — block ${blockHeight}, ${Object.keys(equities).length} tickers`
    );
    return snap;
  }
}
