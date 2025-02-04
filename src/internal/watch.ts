import type { Watcher } from '../interop';
import { updateLinkProducerValue, type BaseLink, type Consumer, type RawStore } from './store';

class WatcherConsumer<T, Link extends BaseLink<T>> implements Consumer, Watcher<T> {
  private dirty = true;
  private registered = false;
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
      const link = this.link;
      if (!this.registered) {
        this.registered = true;
        link.producer.registerConsumer(link);
      }
      this.dirty = false;
      const producer = link.producer;
      updateLinkProducerValue(link);
      if (producer.isLinkUpToDate(link)) {
        return false;
      }
      producer.updateLink(link);
      return true;
    }
    return false;
  }

  get(): T {
    if (this.dirty) {
      throw new Error('invalid watcher state');
    }
    return this.link.producer.readValue();
  }

  suspend(): void {
    this.dirty = true;
    if (this.registered) {
      this.registered = false;
      const link = this.link;
      link.producer.unregisterConsumer(link);
    }
  }
}

const exposeWatcher = <T>(watcherConsumer: WatcherConsumer<T, BaseLink<T>>): Watcher<T> => ({
  isUpToDate: watcherConsumer.isUpToDate.bind(watcherConsumer),
  update: watcherConsumer.update.bind(watcherConsumer),
  get: watcherConsumer.get.bind(watcherConsumer),
  suspend: watcherConsumer.suspend.bind(watcherConsumer),
});

export const watchRawStore = <T>(
  producer: RawStore<T, BaseLink<T>>,
  notify: () => void
): Watcher<T> => exposeWatcher(new WatcherConsumer(producer, notify));
