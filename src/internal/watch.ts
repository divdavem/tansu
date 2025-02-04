import type { Watcher } from '../interop';
import { updateLinkProducerValue, type BaseLink, type Consumer, type RawStore } from './store';

class WatcherConsumer<T, Link extends BaseLink<T>> implements Consumer, Watcher<T> {
  private dirty = true;
  private started = false;
  private link: Link;
  constructor(
    producer: RawStore<T, Link>,
    private notifyFn: () => void
  ) {
    this.link = producer.newLink(this);
  }

  isUpToDate(): boolean {
    return !this.dirty;
  }

  markDirty(): void {
    if (!this.dirty) {
      this.dirty = true;
      const notifyFn = this.notifyFn;
      notifyFn();
    }
  }

  update(): boolean {
    if (this.dirty) {
      const prevStarted = this.started;
      try {
        if (!prevStarted) {
          this.start();
        }
        this.dirty = false;
        const link = this.link;
        const producer = link.producer;
        updateLinkProducerValue(link);
        if (producer.isLinkUpToDate(link)) {
          return false;
        }
        producer.updateLink(link);
        return true;
      } finally {
        if (!prevStarted) {
          this.stop();
        }
      }
    }
    return false;
  }

  get(): T {
    if (this.dirty) {
      throw new Error('invalid watcher state');
    }
    return this.link.producer.readValue();
  }

  start(): void {
    if (!this.started) {
      this.started = true;
      const link = this.link;
      link.producer.registerConsumer(link);
    }
  }

  stop(): void {
    this.dirty = true;
    if (this.started) {
      this.started = false;
      const link = this.link;
      link.producer.unregisterConsumer(link);
    }
  }
}

const exposeWatcher = <T>(watcherConsumer: WatcherConsumer<T, BaseLink<T>>): Watcher<T> => ({
  isUpToDate: watcherConsumer.isUpToDate.bind(watcherConsumer),
  update: watcherConsumer.update.bind(watcherConsumer),
  get: watcherConsumer.get.bind(watcherConsumer),
  start: watcherConsumer.start.bind(watcherConsumer),
  stop: watcherConsumer.stop.bind(watcherConsumer),
});

export const watchRawStore = <T>(
  producer: RawStore<T, BaseLink<T>>,
  notify: () => void
): Watcher<T> => exposeWatcher(new WatcherConsumer(producer, notify));
