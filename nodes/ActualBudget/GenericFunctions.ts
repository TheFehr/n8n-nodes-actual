import { init, downloadBudget, shutdown } from '@actual-app/api';

export interface Credentials {
	url: string;
	password: string;
}

// @actual-app/api stores its session (DB connection, sync clock) in a module-level
// singleton shared by every execution/loadOptions call of this node in the process.
// Running two concurrently lets one's init()/shutdown() tear down state the other is
// mid-operation on, so all of them are funneled through this queue to run one at a time.
let executionQueue: Promise<unknown> = Promise.resolve();

export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
	const result = executionQueue.then(fn, fn);
	executionQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

async function initializeActualBudget(auth: Credentials): Promise<void> {
	await init({
		serverURL: auth.url,
		password: auth.password,
	});
}

/**
 * Runs `fn` against a freshly initialized+downloaded budget, serialized against every
 * other execute()/listSearch call via runExclusive, and always shuts the session down
 * afterwards.
 */
export async function withBudgetSession<T>(
	auth: Credentials,
	budgetId: string,
	fn: () => Promise<T>,
): Promise<T> {
	return runExclusive(async () => {
		await initializeActualBudget(auth);
		try {
			await downloadBudget(budgetId);
			return await fn();
		} finally {
			await shutdown();
		}
	});
}
