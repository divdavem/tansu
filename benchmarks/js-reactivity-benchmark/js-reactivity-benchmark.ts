import { writeFile } from 'fs/promises';
import { logPerfHeaders, logPerfResult, testFramework } from 'js-reactivity-benchmark';
import { tansuFramework } from './adapter';

(async () => {
  logPerfHeaders();
  const results: { name: string; value: number; unit: string }[] = [];
  await testFramework({ framework: tansuFramework, testPullCounts: true }, (result) => {
    logPerfResult(result);
    results.push({ name: result.test, value: result.time, unit: 'ms' });
  });
  await writeFile('js-reactivity-benchmarks.json', JSON.stringify(results, null, ' '));
})();
