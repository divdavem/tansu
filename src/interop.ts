export const watchSignal = Symbol('watchSignal');

export interface Signal<T> {
  [watchSignal](notify: () => void): Watcher<T>;
}

export interface Watcher<T> {
  start(): void;
  stop(): void;
  isUpToDate(): boolean;
  update(): boolean;
  get(): T;
}

export type Consumer = { addProducer: <T>(signal: Signal<T>) => void };

let activeConsumer: Consumer | null = null;

export const addActiveConsumerProducer = <T>(producer: Signal<T>): void => {
  activeConsumer?.addProducer(producer);
};

export const setActiveConsumer = (consumer: Consumer | null): Consumer | null => {
  const prevConsumer = activeConsumer;
  activeConsumer = consumer;
  return prevConsumer;
};

export const getActiveConsumer = (): Consumer | null => activeConsumer;

export const runWithConsumer = <T>(f: () => T, consumer: Consumer | null = null): T => {
  if (consumer === activeConsumer) {
    return f();
  }
  const prevConsumer = activeConsumer;
  activeConsumer = consumer;
  try {
    return f();
  } finally {
    activeConsumer = prevConsumer;
  }
};

let inBatch = false;
let batchQueue: (() => void)[] = [];
let asyncBatchQueue: (() => void)[] = [];

/**
 * Run a function in batch.
 * At the end of the top-level batch, all the functions planned with afterBatch are called.
 * @param fn - the function to run in batch
 * @returns the result of the function
 */
export const batch = <T>(fn: () => T): T => {
  if (inBatch) {
    return fn();
  }
  inBatch = true;
  let queueError: any;
  let res: T;
  try {
    res = fn();
  } finally {
    while (batchQueue.length > 0) {
      try {
        batchQueue.shift()!();
      } catch (error) {
        if (!queueError) {
          queueError = { error };
        }
      }
    }
    inBatch = false;
  }
  if (queueError) {
    throw queueError.error;
  }
  return res;
};

let plannedAsyncBatch = false;
const noop = () => {};
const asyncBatch = () => {
  plannedAsyncBatch = false;
  batchQueue = asyncBatchQueue;
  asyncBatchQueue = [];
  batch(noop);
};

/**
 * Plan a function to be called after the current batch.
 * If the current code is not running in a batch, the function is scheduled to be called after the current microtask.
 * @param fn - the function to call after the current batch
 */
export const afterBatch = (fn: () => void): void => {
  if (inBatch) {
    batchQueue.push(fn);
  } else {
    asyncBatchQueue.push(fn);
    if (!plannedAsyncBatch) {
      plannedAsyncBatch = true;
      Promise.resolve().then(asyncBatch);
    }
  }
};
