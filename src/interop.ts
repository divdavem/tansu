export const watchSignal = Symbol('watchSignal');

export interface Signal<T> {
  /**
   * Create a new watcher for the signal. The watcher is created out-of-date.
   * Once a watcher is out-of-date, it remains out-of-date until its update function is called.
   * @param notify - function to call synchronously when the watcher passes from the up-to-date state to the out-of-date state
   * (i.e. one of the transitive dependencies of the signal or the signal itself has changed).
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
   * Recompute the value of the signal (if not already up-to-date) and return true if the value has changed since the last call of update.
   */
  update(): boolean;

  /**
   * Return the current value of the signal, or throw an error if the signal is in an error state.
   * Also throw an error if the watcher is not up-to-date.
   */
  get(): T;

  /**
   * Destroy the watcher and release any resources associated with it.
   * After calling destroy, the watcher should not be used anymore and the notify function will not be called anymore.
   */
  destroy(): void;
}

/**
 * A consumer is a function that can register signals as dependencies.
 * @param signal - the signal to register as a dependency.
 */
export type Consumer = <T>(signal: Signal<T>) => void;

let currentConsumer: Consumer | null = null;

/**
 * Call the current consumer to register a signal as a dependency.
 * @param signal - the signal to register as a dependency
 */
export const callCurrentConsumer: Consumer = (signal) => {
  currentConsumer?.(signal);
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
  const prevConsumer = currentConsumer;
  currentConsumer = consumer;
  try {
    return f();
  } finally {
    currentConsumer = prevConsumer;
  }
};
