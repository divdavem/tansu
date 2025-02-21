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

/**
 * A consumer is a function that can register signals as dependencies.
 * @param signal - the signal to register as a dependency.
 */
export type Consumer = { addProducer: <T>(signal: Signal<T>) => void };

let currentConsumer: Consumer | null = null;

/**
 * Call the current consumer to register a signal as a dependency.
 * @param signal - the signal to register as a dependency
 */
export const callCurrentConsumer = <T>(signal: Signal<T>): void => {
  currentConsumer?.addProducer(signal);
};

/**
 * @returns true if there is a current consumer, false otherwise
 */
export const hasCurrentConsumer = (): boolean => !!currentConsumer;

/**
 * Run a function with a given consumer.
 * @param f - the function to run
 * @param consumer - the consumer, if not defined, the current consumer is set to null (equivalent to untrack)
 * @returns the result of the function
 */
export const runWithConsumer = <T>(f: () => T, consumer: Consumer | null = null): T => {
  if (consumer === currentConsumer) {
    return f();
  }
  const prevConsumer = currentConsumer;
  currentConsumer = consumer;
  try {
    return f();
  } finally {
    currentConsumer = prevConsumer;
  }
};

/**
 * Sets the current consumer.
 * @param consumer - the consumer to set
 * @returns a function to call to restore the previous consumer, this function should be called inside a finally block
 * in the same tick to ensure the consumer is always restored synchronously
 */
export const startRunWithConsumer = (consumer: Consumer | null = null): (() => void) => {
  if (consumer === currentConsumer) {
    return noop;
  }
  const prevConsumer = currentConsumer;
  currentConsumer = consumer;
  let active = true;
  return () => {
    if (active) {
      active = false;
      currentConsumer = prevConsumer;
    }
  };
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
