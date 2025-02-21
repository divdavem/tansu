export const watchSignal = Symbol('watchSignal');

export interface Signal<T> {
  /**
   * Create a new watcher for the signal. The watcher is created suspended.
   * A suspended watcher is out-of-date. It can be resumed by calling its update function.
   * Once a watcher is out-of-date, it remains out-of-date until its update function is called.
   * @param notify - function to call synchronously when the watcher passes from the up-to-date state to the out-of-date state
   * without the suspend function being called (i.e. one of the transitive dependencies of the signal or the signal itself has changed).
   * The notify function must not read any signal synchronously. It can schedule an asynchronous task to read signals.
   * It should not throw any error. If other up-to-date watched signals depend on the value from this watcher, this notify function
   * should synchronously call their notify function.
   */
  [watchSignal](notify: () => void): Watcher<T>;
}

/**
 * A watcher is an object that keeps track of the value of a signal.
 */
export interface Watcher<T> {
  /**
   * Return true if the watcher is up-to-date, false otherwise.
   */
  isUpToDate(): boolean;

  /**
   * Recompute the value of the signal (if not already up-to-date).
   *
   * @remarks
   *
   * If the watcher was suspended, it is resumed.
   * When a watcher is no longer needed (either temporarily or permanently),
   * it should be suspended with a call to its suspend method to free resources.
   *
   * @returns true if the value has changed since the last call of update, false otherwise.
   */
  update(): boolean;

  /**
   * Return the current value of the signal, or throw an error if the signal is in an error state.
   * Also throw an error if the watcher is not up-to-date.
   */
  get(): T;

  /**
   * Suspend the watcher.
   *
   * @remarks
   *
   * While the watcher is suspended, it is out-of-date.
   * Depending on the implementation, suspending a watcher may do more than just marking it as out-of-date.
   * For example, it may unregister the watcher from its producer.
   */
  suspend(): void;
}

/**
 * A consumer is a function that can register signals as dependencies.
 * @param signal - the signal to register as a dependency.
 */
export type Consumer = {addProducer: <T>(signal: Signal<T>) => void};

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
