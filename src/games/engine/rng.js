import { createHash } from 'node:crypto';

const UINT32 = 2 ** 32;

/** 可证公平：结果完全由 (serverSeed, clientSeed, nonce) 决定，可离线复核。 */
export function seedHash(serverSeed, clientSeed = '', nonce = 0) {
  return createHash('sha256').update(`${serverSeed}:${clientSeed}:${nonce}`).digest('hex');
}

export function hashServerSeed(serverSeed) {
  return createHash('sha256').update(String(serverSeed)).digest('hex');
}

export function randomSeed() {
  return createHash('sha256').update(`${Date.now()}:${Math.random()}:${process.pid}`).digest('hex').slice(0, 32);
}

export class Rng {
  constructor({ serverSeed, clientSeed = '', nonce = 0 } = {}) {
    if (!serverSeed) throw new Error('Rng requires serverSeed');
    this.serverSeed = String(serverSeed);
    this.clientSeed = String(clientSeed || '');
    this.nonce = Number(nonce) || 0;
  }

  static from(state) {
    return new Rng(state);
  }

  get state() {
    return { serverSeed: this.serverSeed, clientSeed: this.clientSeed, nonce: this.nonce };
  }

  nextUint32() {
    const hex = seedHash(this.serverSeed, this.clientSeed, this.nonce);
    this.nonce += 1;
    return parseInt(hex.slice(0, 8), 16);
  }

  float() {
    return this.nextUint32() / UINT32;
  }

  int(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.float() * maxExclusive);
  }

  range(minInclusive, maxInclusive) {
    return minInclusive + this.int(maxInclusive - minInclusive + 1);
  }

  pick(list) {
    return list[this.int(list.length)];
  }

  weighted(items, weightOf = (x) => x.weight) {
    const total = items.reduce((sum, it) => sum + Math.max(0, weightOf(it)), 0);
    if (total <= 0) return items[0];
    let r = this.float() * total;
    for (const it of items) {
      r -= Math.max(0, weightOf(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
