import {
  hasActiveConsumer as interopHasActiveConsumer,
  producerAccessed,
  setActiveConsumerLibrary,
  type ConsumerLibrary,
} from '../interop';
import { RawStoreFlags, type BaseLink, type RawStore } from './store';
import { toInteropSignal } from './storeToInteropSignal';

export interface TansuActiveConsumer {
  addProducer: <T, L extends BaseLink<T>>(store: RawStore<T, L>) => void;
}

export let tansuActiveConsumer: TansuActiveConsumer | null = null;
let isTansuActive = false;

const noop = (): void => {};

export const tansuConsumerLibrary: ConsumerLibrary = {
  onActiveChange: (isActive) => {
    isTansuActive = isActive;
  },
  hasActiveConsumer: () => !!tansuActiveConsumer,
  producerAccessed: noop, // the producerAccessed function is defined in ../index.ts to avoid a circular dependency here
};

export const tansuProducerAccessed = <T>(store: RawStore<T>): void => {
  if (!tansuActiveConsumer || !isTansuActive) {
    // tansu calls updateValue in addProducer, so we don't need to call it here
    store.updateValue();
    // Ignoring coverage for the following lines because, unless there is a bug in tansu (which would have to be fixed!)
    // there should be no way to trigger this error.
    /* v8 ignore next 3 */
    if (store.flags & RawStoreFlags.DIRTY) {
      throw new Error('assert failed: store still dirty after updating it');
    }
  }
  if (isTansuActive) {
    tansuActiveConsumer?.addProducer(store);
  } else if (interopHasActiveConsumer()) {
    producerAccessed(toInteropSignal(store));
  }
};

export const hasActiveConsumer = (): boolean =>
  isTansuActive ? !!tansuActiveConsumer : interopHasActiveConsumer();

export const setActiveConsumer = (consumer: TansuActiveConsumer | null): (() => void) => {
  if ((tansuActiveConsumer === consumer && isTansuActive) || (!consumer && !hasActiveConsumer())) {
    return noop;
  }
  const restoreLib = isTansuActive ? noop : setActiveConsumerLibrary(tansuConsumerLibrary);
  const prev = tansuActiveConsumer;
  tansuActiveConsumer = consumer;
  return () => {
    tansuActiveConsumer = prev;
    restoreLib();
  };
};
