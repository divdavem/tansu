import {
  type ConsumerLibrary,
  hasActiveConsumer,
  producerAccessed,
  setActiveConsumerLibrary,
  type WatchableSignal,
} from '../../src/interop';
import { type ReactiveFramework } from '../adapters/type';

const noop = (): void => {};

const wrappedWeakMap = new WeakMap<WatchableSignal, WatchableSignal>();
export const forceInteropAPIWrapper =
  <T>(fn: () => T) =>
  (): T => {
    const switchToOriginal = () => {
      const original = prevLibrary;
      prevLibrary = noop;
      original();
      return () => {
        prevLibrary = setActiveConsumerLibrary(thisConsumerLibrary);
      };
    };
    const thisConsumerLibrary: ConsumerLibrary = {
      hasActiveConsumer() {
        const finished = switchToOriginal();
        try {
          return hasActiveConsumer();
        } finally {
          finished();
        }
      },
      producerAccessed: (signal) => {
        let wrapped = wrappedWeakMap.get(signal);
        if (!wrapped) {
          wrapped = {
            watchSignal: signal.watchSignal.bind(signal),
          };
          wrappedWeakMap.set(signal, wrapped);
        }
        const finished = switchToOriginal();
        try {
          producerAccessed(wrapped);
        } finally {
          finished();
        }
      },
    };
    let prevLibrary = setActiveConsumerLibrary(thisConsumerLibrary);
    try {
      return fn();
    } finally {
      prevLibrary();
    }
  };

export const wrapAdapterWithForceInteropAPI = (
  baseFramework: ReactiveFramework
): ReactiveFramework => {
  if (baseFramework.interop !== true) {
    throw new Error('incompatible framework');
  }
  return {
    ...baseFramework,
    signal: (initialValue) => {
      const signal = baseFramework.signal(initialValue);
      return {
        read: forceInteropAPIWrapper(signal.read),
        write: signal.write,
      };
    },
    computed: (fn) => baseFramework.computed(forceInteropAPIWrapper(fn)),
    effect: (fn) => baseFramework.effect(forceInteropAPIWrapper(fn)),
    name: `forceInteropAPI(${baseFramework.name})`,
  };
};
