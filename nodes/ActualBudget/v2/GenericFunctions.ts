import { init, downloadBudget, shutdown } from '@actual-app/api';

import { runExclusive } from '../executionQueue';

export interface Credentials {
	url: string;
	password: string;
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
