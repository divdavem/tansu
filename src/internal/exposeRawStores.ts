import { type Watcher } from '../interop';
import type { Readable, ReadableSignal, StoreInput } from '../types';
import { rawStoreSymbol, type RawStore } from './store';
import { RawStoreFromWatch } from './storeFromWatch';
import { RawSubscribableWrapper } from './storeSubscribable';
import { watchRawStore } from './watch';

/**
 * Symbol used in {@link InteropObservable} allowing any object to expose an observable.
 */
export const symbolObservable: typeof Symbol.observable =
  (typeof Symbol === 'function' && Symbol.observable) || ('@@observable' as any);

const returnThis = function <T>(this: T): T {
  return this;
};

const watch = function <T extends StoreInput<T>>(this: T, notify: () => void): Watcher<T> {
  return watchRawStore(getRawStore(this), notify);
};

const rawStoreMap = new WeakMap<StoreInput<any>, RawStore<any>>();

export const getRawStore = <T>(storeInput: StoreInput<T>): RawStore<T> => {
  const rawStore = (storeInput as any)[rawStoreSymbol];
  if (rawStore) {
    return rawStore;
  }
  let res = rawStoreMap.get(storeInput);
  if (!res) {
    if ('watchSignal' in storeInput) {
      res = new RawStoreFromWatch(storeInput);
    } else {
      let subscribable = storeInput;
      if (!('subscribe' in subscribable)) {
        subscribable = subscribable[symbolObservable]();
      }
      res = new RawSubscribableWrapper(subscribable);
    }
    rawStoreMap.set(storeInput, res);
  }
  return res;
};

export const exposeRawStore = <T, U>(
  rawStore: RawStore<T>,
  extraProp?: U
): ReadableSignal<T> & Omit<U, keyof Readable<T>> => {
  const get = rawStore.get.bind(rawStore) as any;
  if (extraProp) {
    Object.assign(get, extraProp);
  }
  get.get = get;
  get.subscribe = rawStore.subscribe.bind(rawStore);
  get[symbolObservable] = returnThis;
  get.watchSignal = watch;
  get[rawStoreSymbol] = rawStore;
  return get;
};
