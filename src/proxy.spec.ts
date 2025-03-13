import { describe, expect, it } from 'vitest';
import { computed, proxyStore } from './index';

describe('objects', () => {
  it('should not wrap simple values', () => {
    expect(proxyStore(1)).toBe(1);
    expect(proxyStore(NaN)).toBe(NaN);
    expect(proxyStore('a')).toBe('a');
    expect(proxyStore(true)).toBe(true);
    expect(proxyStore(false)).toBe(false);
    expect(proxyStore(null)).toBe(null);
    expect(proxyStore(undefined)).toBe(undefined);
  });

  it('should not wrap custom objects', () => {
    class MyObject {}
    const myObject = new MyObject();
    expect(proxyStore(myObject)).toBe(myObject);
  });

  it('should work in a non-reactive context', () => {
    const myStore = proxyStore({} as { value?: number });
    expect('value' in myStore).toBe(false);
    expect(myStore.value).toBe(undefined);
    expect(Object.keys(myStore)).toEqual([]);
    expect(Object.hasOwn(myStore, 'value')).toBe(false);
    myStore.value = 1;
    expect(myStore.value).toBe(1);
    expect('value' in myStore).toBe(true);
    expect(Object.keys(myStore)).toEqual(['value']);
    expect(Object.hasOwn(myStore, 'value')).toBe(true);
    myStore.value = 2;
    expect(myStore.value).toBe(2);
    delete myStore.value;
    expect(myStore.value).toBe(undefined);
    expect('value' in myStore).toBe(false);
    expect(Object.keys(myStore)).toEqual([]);
    expect(Object.hasOwn(myStore, 'value')).toBe(false);
    delete myStore.value; // does nothing
    expect(myStore.value).toBe(undefined);
  });

  it('should be reactive when adding and removing a property', () => {
    const values = [] as number[];
    const myStore = proxyStore({} as any);
    const value = computed(() => myStore.value);
    const unsubscribe = value.subscribe((value) => values.push(value));
    expect(values).toEqual([undefined]);
    myStore.value = 1;
    expect(values).toEqual([undefined, 1]);
    delete myStore.value;
    expect(values).toEqual([undefined, 1, undefined]);
    myStore.value = 2;
    expect(values).toEqual([undefined, 1, undefined, 2]);
    unsubscribe();
  });

  it('should be reactive with Object.keys', () => {
    const keysUpdates = [] as string[][];
    const myStore = proxyStore({} as any);
    const keys = computed(() => Object.keys(myStore));
    const unsubscribe = keys.subscribe((value) => keysUpdates.push(value));
    expect(keysUpdates).toEqual([[]]);
    myStore.value = 1;
    expect(keysUpdates).toEqual([[], ['value']]);
    myStore.value = 2;
    expect(keysUpdates).toEqual([[], ['value']]);
    myStore.newProp = 3;
    expect(keysUpdates).toEqual([[], ['value'], ['value', 'newProp']]);
    delete myStore.value;
    expect(keysUpdates).toEqual([[], ['value'], ['value', 'newProp'], ['newProp']]);
    myStore.value = 3;
    expect(keysUpdates).toEqual([
      [],
      ['value'],
      ['value', 'newProp'],
      ['newProp'],
      ['newProp', 'value'],
    ]);
    unsubscribe();
  });

  it('should be reactive with Object.hasOwn', () => {
    const myStore = proxyStore({} as any);
    const c = computed(() => Object.hasOwn(myStore, 'value'));
    const values = [] as boolean[];
    const unsubscribe = c.subscribe((value) => values.push(value));
    expect(values).toEqual([false]);
    myStore.value = 1;
    expect(values).toEqual([false, true]);
    delete myStore.value;
    expect(values).toEqual([false, true, false]);
    myStore.value = 1;
    expect(values).toEqual([false, true, false, true]);
    unsubscribe();
  });

  it('should be reactive with "in" operator', () => {
    const myStore = proxyStore({} as any);
    const c = computed(() => 'value' in myStore);
    const values = [] as boolean[];
    const unsubscribe = c.subscribe((value) => values.push(value));
    expect(values).toEqual([false]);
    myStore.value = 1;
    expect(values).toEqual([false, true]);
    delete myStore.value;
    expect(values).toEqual([false, true, false]);
    myStore.value = 1;
    expect(values).toEqual([false, true, false, true]);
    unsubscribe();
  });

  it('should work with Object.preventExtensions', () => {
    const myStore = proxyStore({ value: 1 } as any);
    Object.preventExtensions(myStore);
    expect(myStore.value).toBe(1);
    myStore.value = 2;
    expect(myStore.value).toBe(2);
    const c = computed(() => myStore.newProp);
    expect(c()).toBe(undefined);
    expect(() => {
      (myStore as any).newProp = 3;
    }).toThrow('not extensible');
    expect(myStore.newProp).toBe(undefined);
    delete myStore.value;
    expect(myStore.value).toBe(undefined);
    expect(() => {
      (myStore as any).value = 3;
    }).toThrow('not extensible');
  });

  it('should have a prototype that cannot be replaced', () => {
    const myStore = proxyStore({} as any);
    const correctProto = Object.getPrototypeOf(myStore);
    const newProto = { hello: 1 };
    expect(() => {
      Object.setPrototypeOf(myStore, newProto);
    }).toThrow();
    expect(myStore.hello).toBe(undefined);
    expect(Object.getPrototypeOf(myStore)).toBe(correctProto);
  });

  it('should not allow defining properties', () => {
    const myStore = proxyStore({} as any);
    expect(() => {
      Object.defineProperty(myStore, 'value', { value: 1 });
    }).toThrow();
  });

  it('should not wrap proxyStore objects', () => {
    const initialValue = {};
    const myStore1 = proxyStore(initialValue);
    const myStore2 = proxyStore(myStore1);
    expect(myStore1).toBe(myStore2);
  });

  it('should copy the initial value', () => {
    const initialValue = { a: 1 };
    const myStore = proxyStore(initialValue);
    initialValue.a = 2;
    expect(myStore.a).toBe(1);
  });

  it('should wrap sub-objects on initialization', () => {
    const myStore = proxyStore({ a: { b: 1 } });
    const c = computed(() => myStore.a.b);
    const values = [] as number[];
    const unsubscribe = c.subscribe((value) => values.push(value));
    expect(values).toEqual([1]);
    myStore.a.b = 2;
    expect(values).toEqual([1, 2]);
    unsubscribe();
  });

  it('should wrap sub-objects on set', () => {
    const myStore = proxyStore({ a: { b: 0 } });
    myStore.a = { b: 1 };
    const c = computed(() => myStore.a.b);
    const values = [] as number[];
    const unsubscribe = c.subscribe((value) => values.push(value));
    expect(values).toEqual([1]);
    myStore.a.b = 2;
    expect(values).toEqual([1, 2]);
    myStore.a = { b: 3 };
    expect(values).toEqual([1, 2, 3]);
    unsubscribe();
  });
});

describe('arrays', () => {
  it('should wrap arrays', () => {
    const myStore = proxyStore([{ a: 1 }]);
    expect(Array.isArray(myStore)).toBe(true);
  });
});
