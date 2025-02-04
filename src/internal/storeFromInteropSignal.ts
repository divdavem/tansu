import type { WatchableSignal, Watcher } from '../interop';
import { type RawStore, RawStoreFlags } from './store';
import { RawStoreComputedOrDerived } from './storeComputedOrDerived';

class RawStoreFromWatch extends RawStoreComputedOrDerived<undefined> {
  // FIXME: remove HAS_VISIBLE_ONUSE and add a new HAS_INTEROP_DEPENDENCIES ? (so that watcher.stop is called asynchronously)
  override flags = RawStoreFlags.HAS_VISIBLE_ONUSE | RawStoreFlags.DIRTY;
  private watcher: Watcher;

  constructor(interopSignal: WatchableSignal) {
    super(undefined as any);
    this.watcher = interopSignal.watchSignal(this.markDirty.bind(this));
  }

  override equal(): boolean {
    return false;
  }

  override startUse(): void {
    this.watcher.start();
    this.flags |= RawStoreFlags.DIRTY;
  }

  override areProducersUpToDate(): boolean {
    return !this.watcher!.update();
  }

  override recompute(): void {
    this.set(undefined);
  }

  override endUse(): void {
    this.watcher.stop();
  }

  protected override increaseEpoch(): void {
    // do nothing
  }
}

const interopSignals = new WeakMap<WatchableSignal, RawStoreFromWatch>();

export const fromInteropSignal = (signal: WatchableSignal): RawStore<any> => {
  let store = interopSignals.get(signal);
  if (!store) {
    store = new RawStoreFromWatch(signal);
    interopSignals.set(signal, store);
  }
  return store;
};
