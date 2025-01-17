import { RawStoreFlags } from './store';
import { checkNotInNotificationPhase, RawStoreWritable } from './storeWritable';
import { activeConsumer, untrack } from './untrack';

let firstInFlushUnusedQueue: RawStoreTrackingUsage<any> | null = null;
let lastInFlushUnusedQueue: RawStoreTrackingUsage<any> | null = null;
let inFlushUnused = false;
let plannedFlushUnused = false;

const removeFromQueue = (store: RawStoreTrackingUsage<any>): boolean => {
  const prev = store.prevInQueue;
  const next = store.nextInQueue;
  if (prev || next || firstInFlushUnusedQueue === store) {
    store.prevInQueue = null;
    store.nextInQueue = null;
    if (prev) {
      prev.nextInQueue = next;
    } else {
      firstInFlushUnusedQueue = next;
    }
    if (next) {
      next.prevInQueue = prev;
    } else {
      lastInFlushUnusedQueue = prev;
    }
    return true;
  }
  return false;
};

const addToQueue = (store: RawStoreTrackingUsage<any>) => {
  if (store.prevInQueue || store.nextInQueue || firstInFlushUnusedQueue === store) {
    return;
  }
  store.prevInQueue = lastInFlushUnusedQueue;
  if (lastInFlushUnusedQueue) {
    lastInFlushUnusedQueue.nextInQueue = store;
  } else {
    firstInFlushUnusedQueue = store;
  }
  lastInFlushUnusedQueue = store;
};

export const flushUnused = (): void => {
  // Ignoring coverage for the following lines because, unless there is a bug in tansu (which would have to be fixed!)
  // there should be no way to trigger this error.
  /* v8 ignore next 3 */
  if (inFlushUnused) {
    throw new Error('assert failed: recursive flushUnused call');
  }
  plannedFlushUnused = false;
  inFlushUnused = true;
  try {
    while (firstInFlushUnusedQueue) {
      const producer = firstInFlushUnusedQueue;
      removeFromQueue(producer);
      producer.flags &= ~RawStoreFlags.FLUSH_PLANNED;
      producer.checkUnused();
    }
  } finally {
    inFlushUnused = false;
  }
};

export abstract class RawStoreTrackingUsage<T> extends RawStoreWritable<T> {
  private extraUsages = 0;
  nextInQueue: RawStoreTrackingUsage<any> | null = null;
  prevInQueue: RawStoreTrackingUsage<any> | null = null;
  abstract startUse(): void;
  abstract endUse(): void;

  override updateValue(): void {
    const flags = this.flags;
    if (!(flags & RawStoreFlags.START_USE_CALLED)) {
      // Ignoring coverage for the following lines because, unless there is a bug in tansu (which would have to be fixed!)
      // there should be no way to trigger this error.
      /* v8 ignore next 3 */
      if (!this.extraUsages && !this.consumerFirst) {
        throw new Error('assert failed: untracked producer usage');
      }
      if (flags & RawStoreFlags.FLUSH_PLANNED) {
        removeFromQueue(this);
        this.flags &= ~RawStoreFlags.FLUSH_PLANNED;
      }
      this.flags |= RawStoreFlags.START_USE_CALLED;
      untrack(() => this.startUse());
    }
  }

  override checkUnused(): void {
    const flags = this.flags;
    if (flags & RawStoreFlags.START_USE_CALLED && !this.extraUsages && !this.consumerFirst) {
      if (inFlushUnused || flags & RawStoreFlags.HAS_VISIBLE_ONUSE) {
        this.flags &= ~RawStoreFlags.START_USE_CALLED;
        untrack(() => this.endUse());
      } else if (!(flags & RawStoreFlags.FLUSH_PLANNED)) {
        this.flags |= RawStoreFlags.FLUSH_PLANNED;
        if (!plannedFlushUnused) {
          plannedFlushUnused = true;
          queueMicrotask(flushUnused);
        }
        addToQueue(this);
      }
    }
  }

  override get(): T {
    checkNotInNotificationPhase();
    if (activeConsumer) {
      return activeConsumer.addProducer(this);
    } else {
      this.extraUsages++;
      try {
        this.updateValue();
        // Ignoring coverage for the following lines because, unless there is a bug in tansu (which would have to be fixed!)
        // there should be no way to trigger this error.
        /* v8 ignore next 3 */
        if (this.flags & RawStoreFlags.DIRTY) {
          throw new Error('assert failed: store still dirty after updating it');
        }
        return this.readValue();
      } finally {
        const extraUsages = --this.extraUsages;
        if (extraUsages === 0) {
          this.checkUnused();
        }
      }
    }
  }
}
