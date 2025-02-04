import { hasActiveConsumer, setActiveConsumer, type TansuActiveConsumer } from './activeConsumer';
import type { BaseLink, Consumer, RawStore } from './store';
import { RawStoreFlags, updateLinkProducerValue } from './store';
import {
  COMPUTED_ERRORED,
  COMPUTED_UNSET,
  RawStoreComputedOrDerived,
} from './storeComputedOrDerived';
import { epoch, notificationPhase } from './storeWritable';

export class RawStoreComputed<T>
  extends RawStoreComputedOrDerived<T>
  implements Consumer, TansuActiveConsumer
{
  private producerIndex = 0;
  private producerLinks: BaseLink<any>[] = [];
  private epoch = -1;

  constructor(private readonly computeFn: () => T) {
    super(COMPUTED_UNSET);
  }

  override increaseEpoch(): void {
    // do nothing
  }

  override updateValue(): void {
    const flags = this.flags;
    if (
      flags & RawStoreFlags.START_USE_CALLED &&
      !(flags & RawStoreFlags.DIRTY) &&
      !(flags & RawStoreFlags.COMPUTING)
    ) {
      return;
    }
    super.updateValue();
    this.epoch = epoch;
  }

  override get(): T {
    // FIXME: better test all cases of this optimization:
    const flags = this.flags;
    if (
      !hasActiveConsumer() &&
      !notificationPhase &&
      !(flags & RawStoreFlags.COMPUTING) &&
      !(flags & RawStoreFlags.DIRTY) &&
      (flags & RawStoreFlags.START_USE_CALLED ||
        (this.epoch === epoch && !(flags & RawStoreFlags.HAS_VISIBLE_ONUSE)))
    ) {
      return this.readValue();
    }
    return super.get();
  }

  addProducer<U, L extends BaseLink<U>>(producer: RawStore<U, L>): void {
    const producerLinks = this.producerLinks;
    const producerIndex = this.producerIndex;
    let link = producerLinks[producerIndex] as L | undefined;
    if (link?.producer !== producer) {
      if (link) {
        producerLinks.push(link); // push the existing link at the end (to be removed later)
      }
      link = producer.registerConsumer(producer.newLink(this));
    }
    producerLinks[producerIndex] = link;
    this.producerIndex = producerIndex + 1;
    updateLinkProducerValue(link);
    if (producer.flags & RawStoreFlags.HAS_VISIBLE_ONUSE) {
      this.flags |= RawStoreFlags.HAS_VISIBLE_ONUSE;
    }
    producer.updateLink(link);
  }

  override startUse(): void {
    const producerLinks = this.producerLinks;
    for (let i = 0, l = producerLinks.length; i < l; i++) {
      const link = producerLinks[i];
      link.producer.registerConsumer(link);
    }
    this.flags |= RawStoreFlags.DIRTY;
  }

  override endUse(): void {
    const producerLinks = this.producerLinks;
    for (let i = 0, l = producerLinks.length; i < l; i++) {
      const link = producerLinks[i];
      link.producer.unregisterConsumer(link);
    }
  }

  override areProducersUpToDate(): boolean {
    if (this.value === COMPUTED_UNSET) {
      return false;
    }
    const producerLinks = this.producerLinks;
    for (let i = 0, l = producerLinks.length; i < l; i++) {
      const link = producerLinks[i];
      const producer = link.producer;
      updateLinkProducerValue(link);
      if (!producer.isLinkUpToDate(link)) {
        return false;
      }
    }
    return true;
  }

  override recompute(): void {
    let value: T;
    const prevActiveConsumer = setActiveConsumer(this);
    try {
      this.producerIndex = 0;
      this.flags &= ~RawStoreFlags.HAS_VISIBLE_ONUSE;
      const computeFn = this.computeFn;
      value = computeFn();
      this.error = null;
    } catch (error) {
      value = COMPUTED_ERRORED;
      this.error = error;
    } finally {
      prevActiveConsumer();
    }
    // Remove unused producers:
    const producerLinks = this.producerLinks;
    const producerIndex = this.producerIndex;
    if (producerIndex < producerLinks.length) {
      for (let i = 0, l = producerLinks.length - producerIndex; i < l; i++) {
        const link = producerLinks.pop()!;
        link.producer.unregisterConsumer(link);
      }
    }
    this.set(value);
  }
}
