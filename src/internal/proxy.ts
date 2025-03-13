import { batch } from './batch';
import { RawStoreComputed } from './storeComputed';
import { RawStoreWritable } from './storeWritable';
import { noop } from './subscribeConsumer';
import { activeConsumer } from './untrack';

const returnFalse = () => false;
const arrayEquals = <T>(a: T[], b: T[]) => {
  const aLength = a.length;
  if (aLength !== b.length) {
    return false;
  }
  for (let i = 0; i < aLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

type KeyInfo<T> = {
  exists: () => boolean;
  get: () => T | undefined;
  set: (value: T | undefined) => void;
  remove: () => void;
};

const inexistentKey: KeyInfo<undefined> = {
  exists: returnFalse,
  get: () => undefined,
  set: noop,
  remove: noop,
};

type KeysPresence = Record<string | symbol, true> & { length: number };

const createKeyInfo = <T>(
  keys: RawStoreWritable<KeysPresence>,
  keysValue: KeysPresence,
  key: string | symbol,
  initialValue?: T,
  existsValue = false
): KeyInfo<T> => {
  const store = new RawStoreWritable(initialValue);
  store.equalFn = Object.is;
  const exists = new RawStoreWritable(existsValue);
  return {
    exists: () => exists.get(),
    get: () => store.get(),
    set: (value: any) =>
      batch(() => {
        if (!existsValue) {
          keysValue[key] = true;
          keys.set(keysValue);
          existsValue = true;
          exists.set(true);
        }
        store.set(proxyStore(value));
      }),
    remove: () => {
      if (existsValue) {
        batch(() => {
          delete keysValue[key];
          keys.set(keysValue);
          store.set(undefined);
          existsValue = false;
          exists.set(false);
        });
      }
    },
  };
};

const objectProto = Object.prototype;
const arrayProto = Array.prototype;

class TansuArrayStore extends Array {}
class TansuObjectStore {}

const wrapInBatch = <T, U extends any[], V>(originalFn: (this: T, ...args: U) => V) =>
  function (this: T, ...args: U) {
    return batch(() => originalFn.call(this, ...args));
  };

const tansuArrayProto = TansuArrayStore.prototype;
for (const fnName of ['fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift']) {
  const fn = (arrayProto as any)[fnName];
  if (typeof fn === 'function') {
    (tansuArrayProto as any)[fnName] = wrapInBatch(fn);
  }
}

const createProxyStore = <T extends object>(initialValue: T): T => {
  const isArray = Array.isArray(initialValue);
  const constructor: any = isArray ? TansuArrayStore : TansuObjectStore;
  const proto = constructor.prototype;
  const keysValue: KeysPresence = new constructor();
  const keys = new RawStoreWritable(keysValue);
  const keysInfo: Record<string | symbol, KeyInfo<any>> = Object.create(null);
  const length = isArray ? new RawStoreComputed(() => keys.get().length) : undefined;
  const setLength = isArray
    ? (value: number) =>
        batch(() => {
          const prevLength = keysValue.length;
          keysValue.length = value;
          const newLength = keysValue.length;
          if (newLength !== prevLength) {
            keys.set(keysValue);
          }
          for (let i = newLength; i < prevLength; i++) {
            keysInfo[i]?.remove();
          }
        })
    : undefined;
  let ownKeys: RawStoreComputed<(string | symbol)[]> | undefined;
  for (const key of Reflect.ownKeys(initialValue)) {
    if (isArray && key === 'length') {
      keysValue.length = initialValue.length;
      continue;
    }
    keysValue[key] = true;
    keysInfo[key] = createKeyInfo(
      keys,
      keysValue,
      key,
      proxyStore((initialValue as any)[key]),
      true
    );
  }
  const getKeyInfo = (key: any, create = false) => {
    let keyInfo = keysInfo[key];
    if (!keyInfo) {
      if (!create && !activeConsumer) {
        return inexistentKey;
      }
      keyInfo = createKeyInfo(keys, keysValue, key);
      keysInfo[key] = keyInfo;
    }
    return keyInfo;
  };
  return new Proxy(keysValue as T, {
    get(target, key) {
      if (length && key === 'length') {
        return length.get();
      }
      return getKeyInfo(key).get() ?? proto[key];
    },
    set(target, key, value) {
      if (setLength && key === 'length') {
        setLength(value);
        return true;
      }
      getKeyInfo(key, true).set(value);
      return true;
    },
    deleteProperty(target, key) {
      if (isArray && key === 'length') {
        return false;
      }
      keysInfo[key]?.remove();
      return true;
    },
    has(target, key) {
      return getKeyInfo(key).exists() || key in proto;
    },
    ownKeys() {
      if (!ownKeys) {
        ownKeys = new RawStoreComputed(() => Reflect.ownKeys(keys.get()));
        ownKeys.equalFn = arrayEquals;
      }
      return [...ownKeys.get()];
    },
    getOwnPropertyDescriptor(target, key) {
      if (length && setLength && key === 'length') {
        return Reflect.getOwnPropertyDescriptor(keysValue, key);
      }
      const store = getKeyInfo(key);
      if (!store.exists()) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        get: store.get,
        set: store.set,
      };
    },
    // unsupported features:
    preventExtensions() {
      return false;
    },
    defineProperty() {
      return false;
    },
    setPrototypeOf() {
      return false;
    },
  });
};

/**
 * Create a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy|Proxy} object
 * which recursively implements each of its properties as a Tansu store.
 *
 * @example
 * ```ts
 * const myStore = proxyStore({ a: 1, b: 2 });
 * const aTimesB = computed(() => myStore.a * myStore.b);
 * aTimesB.subscribe((value) => console.log(value)); // logs: 2
 * myStore.a = 2; // logs: 4
 * myStore.b = 3; // logs: 6
 * ```
 *
 * @param initialValue - The initial value of the object. It is copied and wrapped in Tansu stores.
 * @returns The proxy store object.
 */
export const proxyStore = <T>(initialValue: T): T => {
  if (typeof initialValue !== 'object' || initialValue == null) {
    return initialValue;
  }
  const proto = Object.getPrototypeOf(initialValue);
  if (proto === objectProto || proto === arrayProto) {
    return createProxyStore(initialValue);
  }
  return initialValue;
};
