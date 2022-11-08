import {get} from '.';
import type {Writable, Readable} from '.';

declare global {
	interface SymbolConstructor {
		readonly observable: symbol;
	}
}
const symbolObservable: typeof Symbol.observable = (typeof Symbol === 'function' && Symbol.observable) || ('@@observable' as any);

const proxyStore = Symbol();
const handler: ProxyHandler<{[proxyStore]: Readable<any> | Writable<any>}> = {
	// read-only methods:
	get(target, p) {
		if (p === symbolObservable) {
			return target[proxyStore];
		}
		const value = get(target[proxyStore]);
		return Reflect.get(value, p);
	},
	has(target, p) {
		const value = get(target[proxyStore]);
		return Reflect.has(value, p);
	},
	ownKeys(target) {
		const value = get(target[proxyStore]);
		return Reflect.ownKeys(value);
	},

	// methods only available for writable:
	set(target, p, newValue) {
		let res = false;
		const store = target[proxyStore];
		if ('update' in store) {
			store.update((value) => {
				value = {...value};
				res = Reflect.set(value, p, newValue);
				return value;
			});
		}
		return res;
	},
	deleteProperty(target, p) {
		let res = false;
		const store = target[proxyStore];
		if ('update' in store) {
			store.update((value) => {
				value = {...value};
				res = Reflect.deleteProperty(value, p);
				return value;
			});
		}
		return res;
	},
};

export type StoreValue<S> = S extends Readable<infer U> ? U : never;
export type StoreProxy<S extends Readable<any> | Writable<any>> = StoreValue<S> & {[symbolObservable]: () => S};
export const createStoreProxy = <S extends Readable<any> | Writable<any>>(store: S): StoreProxy<S> => {
	return new Proxy(Object.create(null, {[proxyStore]: {value: store}}), handler) as StoreProxy<S>;
};

export const getStore = <S>(proxy: {[symbolObservable]: () => S}): S => proxy[symbolObservable]();
