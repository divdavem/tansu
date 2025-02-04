import type { Watcher, Signal } from '../interop';
import { RawStoreFlags } from './store';
import { COMPUTED_ERRORED, RawStoreComputedOrDerived } from './storeComputedOrDerived';

export class RawStoreFromWatch<T> extends RawStoreComputedOrDerived<T> {
  override flags = RawStoreFlags.HAS_VISIBLE_ONUSE | RawStoreFlags.DIRTY;
  private watcher: Watcher<T>;

  constructor(interopSignal: Signal<T>) {
    super(undefined as any);
    this.watcher = interopSignal.watchSignal(this.markDirty.bind(this));
  }

  override startUse(): void {
    this.watcher.start();
    this.flags |= RawStoreFlags.DIRTY;
  }

  override areProducersUpToDate(): boolean {
    return !this.watcher!.update();
  }

  override recompute(): void {
    let value;
    try {
      value = this.watcher.get();
      this.error = null;
    } catch (error) {
      value = COMPUTED_ERRORED;
      this.error = error;
    }
    this.set(value);
  }

  override endUse(): void {
    this.watcher.stop();
  }
}
