/**
 * kie.ai client — create a generation task, poll it, download the result.
 *
 * WHY A CLIENT AND NOT JUST fetch()
 * ---------------------------------
 * Three things this has to get right that a bare call does not:
 *
 *   1. Generation is ASYNC. A 200 from createTask means "accepted", not "done".
 *      The real result arrives only from recordInfo, and only once `state`
 *      reaches `success`. Treating the create response as the result is the
 *      single most common way to integrate this API wrong.
 *   2. It costs real money per call. Every response carries `creditsConsumed`,
 *      so spend is knowable — and therefore cappable. See SpendLedger.
 *   3. The account is rate limited to 20 new tasks / 10s. Batches have to
 *      pace themselves or they get 429'd mid-run and lose the batch.
 *
 * The key is read from the environment and never logged, never echoed into an
 * error message, and never written to disk by this file.
 */

const BASE = 'https://api.kie.ai/api/v1';

/** Terminal + in-flight task states, per the recordInfo schema. */
const STATE = {
  waiting: 'pending',
  queuing: 'pending',
  generating: 'pending',
  success: 'done',
  fail: 'failed',
};

/** Response codes worth naming, so failures read as English not integers. */
const CODE_MEANING = {
  401: 'unauthorized — the API key is missing, wrong, or revoked',
  402: 'insufficient credits — top up at https://kie.ai/billing',
  404: 'not found — check the model identifier against https://kie.ai/market',
  422: 'invalid parameters — the model rejected this input shape',
  429: 'rate limited — more than 20 new tasks in 10 seconds',
  433: 'content rejected by the model provider',
  455: 'service under maintenance',
  500: 'kie.ai server error',
  501: 'generation failed on the provider side',
  505: 'feature disabled',
};

export class KieError extends Error {
  constructor(message, { code, taskId, failCode, failMsg } = {}) {
    super(message);
    this.name = 'KieError';
    this.code = code;
    this.taskId = taskId;
    this.failCode = failCode;
    this.failMsg = failMsg;
  }
}

/**
 * Running total of credits actually consumed, with a hard ceiling.
 *
 * The ceiling exists because this pipeline is driven by an agent, and an agent
 * in a generate-look-regenerate loop can spend a month of plan in an afternoon
 * without anyone watching. `reserve()` is called BEFORE a task is created, so
 * the batch stops at the boundary rather than discovering it afterwards.
 */
export class SpendLedger {
  constructor(ceiling = Infinity) {
    this.ceiling = ceiling;
    this.spent = 0;
    this.reserved = 0;
    this.entries = [];
  }

  /** Throws rather than starting work that would breach the ceiling. */
  reserve(estimate, label) {
    const projected = this.spent + this.reserved + estimate;
    if (projected > this.ceiling) {
      throw new KieError(
        `credit ceiling reached: "${label}" would bring this run to ~${projected} ` +
          `credits, ceiling is ${this.ceiling}. Raise FORGE_CREDIT_CEILING ` +
          `deliberately, or run a smaller batch.`
      );
    }
    this.reserved += estimate;
  }

  /** Called with the real number once the task settles. */
  settle(estimate, actual, label) {
    this.reserved = Math.max(0, this.reserved - estimate);
    const cost = Number(actual) || 0;
    this.spent += cost;
    this.entries.push({ label, credits: cost });
    return cost;
  }

  report() {
    return { spent: this.spent, ceiling: this.ceiling, entries: this.entries };
  }
}

function authHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Wraps a kie.ai response envelope. Every endpoint returns { code, msg, data },
 * and a non-200 `code` inside an HTTP 200 body is a real failure — so checking
 * the HTTP status alone is not enough.
 */
async function envelope(res, what) {
  let body;
  try {
    body = await res.json();
  } catch {
    throw new KieError(`${what}: response was not JSON (HTTP ${res.status})`, {
      code: res.status,
    });
  }
  const code = body?.code ?? res.status;
  if (code !== 200) {
    const meaning = CODE_MEANING[code] ?? body?.msg ?? 'unknown error';
    throw new KieError(`${what}: ${meaning} (code ${code})`, { code });
  }
  return body.data;
}

export class KieClient {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey  read from env by the caller; never logged
   * @param {SpendLedger} [opts.ledger]
   * @param {(msg: string) => void} [opts.log]
   */
  constructor({ apiKey, ledger = new SpendLedger(), log = () => {} }) {
    if (!apiKey) {
      throw new KieError(
        'no API key. Copy .env.example to .env and set KIE_API_KEY ' +
          '(get one at https://kie.ai/api-key).'
      );
    }
    this.#apiKey = apiKey;
    this.ledger = ledger;
    this.log = log;
  }

  #apiKey;

  /** POST /jobs/createTask — returns a taskId, NOT a result. */
  async createTask(model, input) {
    const res = await fetch(`${BASE}/jobs/createTask`, {
      method: 'POST',
      headers: authHeaders(this.#apiKey),
      body: JSON.stringify({ model, input }),
    });
    const data = await envelope(res, `createTask(${model})`);
    if (!data?.taskId) {
      throw new KieError(`createTask(${model}): response carried no taskId`);
    }
    return data.taskId;
  }

  /** GET /jobs/recordInfo — one poll. */
  async recordInfo(taskId) {
    const res = await fetch(
      `${BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: authHeaders(this.#apiKey) }
    );
    return envelope(res, `recordInfo(${taskId})`);
  }

  /**
   * Poll until the task settles. Backs off from 2s to 15s — video models take
   * minutes, and hammering a slow task just burns rate-limit budget the rest
   * of the batch needs.
   */
  async waitFor(taskId, { timeoutMs = 10 * 60 * 1000 } = {}) {
    const started = Date.now();
    let delay = 2000;
    let lastState = null;

    for (;;) {
      const data = await this.recordInfo(taskId);
      const phase = STATE[data.state] ?? 'pending';

      if (data.state !== lastState) {
        lastState = data.state;
        const pct = data.progress != null ? ` ${data.progress}%` : '';
        this.log(`  ${taskId.slice(0, 8)}… ${data.state}${pct}`);
      }

      if (phase === 'done') return data;

      if (phase === 'failed') {
        throw new KieError(
          `generation failed: ${data.failMsg || 'no reason given'}`,
          { taskId, failCode: data.failCode, failMsg: data.failMsg }
        );
      }

      if (Date.now() - started > timeoutMs) {
        throw new KieError(
          `timed out after ${Math.round(timeoutMs / 1000)}s in state "${data.state}". ` +
            `The task may still finish — check taskId ${taskId} at https://kie.ai.`,
          { taskId }
        );
      }

      await sleep(delay);
      delay = Math.min(delay * 1.4, 15000);
    }
  }

  /**
   * Create → wait → return result URLs, charging the ledger on both sides.
   * `estimate` is what we reserve up front; the ledger settles to the real
   * `creditsConsumed` once the task lands.
   */
  async generate({ model, input, label = model, estimate = 0 }) {
    this.ledger.reserve(estimate, label);
    this.log(`→ ${label} [${model}] (~${estimate} credits)`);

    const taskId = await this.createTask(model, input);
    const data = await this.waitFor(taskId);

    let urls = [];
    try {
      const parsed = JSON.parse(data.resultJson || '{}');
      urls = parsed.resultUrls ?? [];
    } catch {
      throw new KieError(`could not parse resultJson for ${taskId}`, { taskId });
    }
    if (urls.length === 0) {
      throw new KieError(`task ${taskId} succeeded but returned no result URLs`, {
        taskId,
      });
    }

    const cost = this.ledger.settle(estimate, data.creditsConsumed, label);
    this.log(
      `✓ ${label} — ${urls.length} file(s), ${cost} credits ` +
        `(run total ${this.ledger.spent})`
    );

    return { taskId, urls, credits: cost, costTimeMs: data.costTime };
  }
}

/** Downloads a result URL to disk. Results are served from short-lived storage. */
export async function download(url, destPath) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const res = await fetch(url);
  if (!res.ok) {
    throw new KieError(`download failed (HTTP ${res.status}) for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, buf);
  return { path: destPath, bytes: buf.length };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Paces a batch under the documented 20-tasks-per-10-seconds limit. Deliberately
 * conservative (6 concurrent) — the limit is on task CREATION, but a wide fan-out
 * also multiplies the cost of a mistake in the prompt.
 */
export async function inBatches(items, worker, { concurrency = 6 } = {}) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(slice.map(worker));
    results.push(...settled);
    if (i + concurrency < items.length) await sleep(10_000);
  }
  return results;
}
