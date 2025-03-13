import { batch } from './batch';
import { RawStoreWritable } from './storeWritable';
import { noop } from './subscribeConsumer';
import { activeConsumer } from './untrack';

const returnFalse = () => false;

type KeyInfo<T> = {
  exists: () => boolean;
  get: () => T | undefined;
  set: (value: T | undefined) => void;
  remove: () => void;
};

const inexistentKey: KeyInfo<undefined> = {
  exists: returnFalse,
  get: () => undefined,
  set: () => {
    throw new Error('not extensible');
  },
  remove: noop,
};

const createKeyInfo = <T>(
  keys: RawStoreWritable<Record<string | symbol, true>>,
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
          keys.update((keys) => {
            keys[key] = true;
            return keys;
          });
          existsValue = true;
          exists.set(true);
        }
        store.set(proxyStore(value));
      }),
    remove: () => {
      if (existsValue) {
        batch(() => {
          keys.update((keys) => {
            delete keys[key];
            return keys;
          });
          store.set(undefined);
          existsValue = false;
          exists.set(false);
        });
      }
    },
  };
};

const objectProxyStoreProto = Object.create(null);
const createObjectProxyStore = <T extends object>(initialValue: T): T => {
  const initKeys: Record<string | symbol, true> = Object.create(objectProxyStoreProto);
  let isExtensible = true;
  const keys = new RawStoreWritable(initKeys);
  const stores: Record<string | symbol, KeyInfo<any>> = Object.create(null);
  for (const key of Reflect.ownKeys(initialValue)) {
    initKeys[key] = true;
    stores[key] = createKeyInfo(keys, key, proxyStore((initialValue as any)[key]), true);
  }
  const getKeyInfo = (key: any, create = false) => {
    let keyInfo = stores[key];
    if (!keyInfo) {
      if ((!create && !activeConsumer) || !isExtensible) {
        return inexistentKey;
      }
      keyInfo = createKeyInfo(keys, key);
      stores[key] = keyInfo;
    }
    return keyInfo;
  };
  return new Proxy(initKeys as T, {
    get(target, key) {
      return getKeyInfo(key).get();
    },
    set(target, key, value) {
      getKeyInfo(key, true).set(value);
      return true;
    },
    deleteProperty(target, key) {
      const keyInfo = stores[key];
      if (keyInfo) {
        keyInfo.remove();
        if (!isExtensible) {
          delete stores[key];
        }
      }
      return true;
    },
    preventExtensions() {
      isExtensible = false;
      Reflect.preventExtensions(initKeys);
      return true;
    },
    has(target, key) {
      return getKeyInfo(key).exists();
    },
    ownKeys() {
      return Reflect.ownKeys(keys.get());
    },
    defineProperty() {
      return false;
    },
    getOwnPropertyDescriptor(target, key) {
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
    setPrototypeOf() {
      return false;
    },
  });
};

const objectProto = Object.prototype;

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
  if (proto === objectProto ) {
    return createObjectProxyStore(initialValue);
  }
  return initialValue;
};


// || (Array.isArray(initialValue) && proto !== objectProxyStoreProto)