import type { Watcher } from '../interop';
import { inFlushUnused, planFlush, type Flushable } from './asyncFlush';
import {
  RawStoreFlags,
  updateLinkProducerValue,
  type BaseLink,
  type Consumer,
  type RawStore,
} from './store';

class WatcherConsumer<T, Link extends BaseLink<T>> implements Consumer, Watcher<T>, Flushable {
  flags = RawStoreFlags.DIRTY;
  private link: Link;
  private usages = 0;
  constructor(
    producer: RawStore<T, Link>,
    private notifyFn: () => void
  ) {
    this.link = producer.newLink(this);
  }

  checkUsed(): void {
    const flags = this.flags;
    if (
      !(flags & RawStoreFlags.START_USE_CALLED) &&
      (this.usages > 0 || flags & RawStoreFlags.START_CALLED)
    ) {
      this.flags |= RawStoreFlags.START_USE_CALLED;
      const link = this.link;
      link.producer.registerConsumer(link);
    }
  }

  checkUnused(explicitStop = false): void {
    if (
      this.flags & RawStoreFlags.START_USE_CALLED &&
      !(this.usages > 0 || this.flags & RawStoreFlags.START_CALLED)
    ) {
      if (inFlushUnused || explicitStop) {
        this.flags |= RawStoreFlags.DIRTY;
        this.flags &= ~RawStoreFlags.START_USE_CALLED;
        const link = this.link;
        link.producer.unregisterConsumer(link);
      } else {
        planFlush(this);
      }
    }
  }

  isStarted(): boolean {
    return !!(this.flags & RawStoreFlags.START_CALLED);
  }

  isUpToDate(): boolean {
    const flags = this.flags;
    return !!(flags & RawStoreFlags.START_CALLED) && !(flags & RawStoreFlags.DIRTY);
  }

  markDirty(): void {
    if (!(this.flags & RawStoreFlags.DIRTY)) {
      this.flags |= RawStoreFlags.DIRTY;
      const notifyFn = this.notifyFn;
      notifyFn();
    }
  }

  update(): boolean {
    if (this.flags & RawStoreFlags.DIRTY) {
      this.usages++;
      try {
        this.checkUsed();
        this.flags &= ~RawStoreFlags.DIRTY;
        const link = this.link;
        const producer = link.producer;
        updateLinkProducerValue(link);
        if (producer.isLinkUpToDate(link)) {
          return false;
        }
        producer.updateLink(link);
        return true;
      } finally {
        this.usages--;
        this.checkUnused();
      }
    }
    return false;
  }

  get(): T {
    if (this.flags & RawStoreFlags.DIRTY) {
      throw new Error('invalid watcher state');
    }
    return this.link.producer.readValue();
  }

  start(): void {
    if (!(this.flags & RawStoreFlags.START_CALLED)) {
      this.flags |= RawStoreFlags.START_CALLED;
      this.checkUsed();
    }
  }

  stop(): void {
    if (this.flags & RawStoreFlags.START_CALLED) {
      this.flags &= ~RawStoreFlags.START_CALLED;
      this.checkUnused(true);
    }
  }
}

const exposeWatcher = <T>(watcherConsumer: WatcherConsumer<T, BaseLink<T>>): Watcher<T> => ({
  isUpToDate: watcherConsumer.isUpToDate.bind(watcherConsumer),
  isStarted: watcherConsumer.isStarted.bind(watcherConsumer),
  update: watcherConsumer.update.bind(watcherConsumer),
  get: watcherConsumer.get.bind(watcherConsumer),
  start: watcherConsumer.start.bind(watcherConsumer),
  stop: watcherConsumer.stop.bind(watcherConsumer),
});

export const watchRawStore = <T>(
  producer: RawStore<T, BaseLink<T>>,
  notify: () => void
): Watcher<T> => exposeWatcher(new WatcherConsumer(producer, notify));
