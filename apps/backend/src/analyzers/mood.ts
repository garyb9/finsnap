/**
 * Market mood vector — combines on-chain metrics + price momentum into
 * human-readable dimensions. Ported from soul-bot mood.ts.
 */

import type {
  WhaleAnalysis,
  GasAnalysis,
  VolumeAnalysis,
  MoodDimension,
  MoodVector,
} from './types';

function labelScale(value: number, labels: string[]): string {
  const idx = Math.min(Math.floor((value / 100) * labels.length), labels.length - 1);
  return labels[Math.max(0, idx)];
}

export function computeFearGreed(
  gas: GasAnalysis,
  whales: WhaleAnalysis,
  volume: VolumeAnalysis
): MoodDimension {
  const fearSignal = gas.networkStress;
  const greedSignal = (whales.whaleEnergy + volume.intensity) / 2;
  const value = Math.min(100, Math.max(0, 50 + (greedSignal - fearSignal) * 0.5));
  const label = labelScale(value, [
    'extreme fear',
    'fear',
    'anxiety',
    'unease',
    'neutral',
    'cautious optimism',
    'optimism',
    'greed',
    'euphoria',
    'extreme euphoria',
  ]);
  return { value: Math.round(value), label };
}

function networkStressDimension(gas: GasAnalysis): MoodDimension {
  return {
    value: Math.round(gas.networkStress),
    label: labelScale(gas.networkStress, [
      'dormant',
      'calm',
      'light activity',
      'moderate load',
      'busy',
      'strained',
      'congested',
      'overloaded',
      'critical',
      'meltdown',
    ]),
  };
}

function whaleEnergyDimension(whales: WhaleAnalysis): MoodDimension {
  return {
    value: Math.round(whales.whaleEnergy),
    label: labelScale(whales.whaleEnergy, [
      'silent depths',
      'faint stirring',
      'gentle currents',
      'movement detected',
      'active',
      'restless',
      'surging',
      'frenzied',
      'tidal wave',
      'biblical flood',
    ]),
  };
}

function volumeCharacterDimension(volume: VolumeAnalysis): MoodDimension {
  return {
    value: Math.round(volume.intensity),
    label: labelScale(volume.intensity, [
      'whisper',
      'murmur',
      'conversation',
      'chatter',
      'buzz',
      'roar',
      'thunder',
      'deafening',
      'sonic boom',
      'big bang',
    ]),
  };
}

function priceMomentumDimension(marketMomentum: number): MoodDimension {
  return {
    value: Math.round(marketMomentum),
    label: labelScale(marketMomentum, [
      'capitulation',
      'bearish drift',
      'weakness',
      'indecision',
      'accumulation',
      'building strength',
      'bullish momentum',
      'strong rally',
      'euphoric surge',
      'parabolic',
    ]),
  };
}

export function computeMood(
  gas: GasAnalysis,
  whales: WhaleAnalysis,
  volume: VolumeAnalysis,
  marketMomentum: number
): MoodVector {
  const fearGreed = computeFearGreed(gas, whales, volume);
  const networkStress = networkStressDimension(gas);
  const whaleEnergy = whaleEnergyDimension(whales);
  const volumeCharacter = volumeCharacterDimension(volume);
  const priceMomentum = priceMomentumDimension(marketMomentum);

  const avg =
    (fearGreed.value +
      networkStress.value +
      whaleEnergy.value +
      volumeCharacter.value +
      priceMomentum.value) /
    5;

  const overallTone: MoodDimension = {
    value: Math.round(avg),
    label: labelScale(avg, [
      'desolate stillness',
      'brooding silence',
      'uneasy calm',
      'watchful waiting',
      'measured pulse',
      'quickening heartbeat',
      'electric anticipation',
      'manic energy',
      'feverish crescendo',
      'supernova',
    ]),
  };

  return { fearGreed, networkStress, whaleEnergy, volumeCharacter, priceMomentum, overallTone };
}
