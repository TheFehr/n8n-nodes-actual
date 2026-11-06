import { IDisplayOptions, INode, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { init, downloadBudget, shutdown } from '@actual-app/api';

import { runExclusive } from '../executionQueue';

export interface Credentials {
	url: string;
	password: string;
	/** The budget this credential works with (node version 3+; older versions use a node parameter). */
	budgetId?: string;
	/** Optional end-to-end encryption password for the budget file (not the server password). */
	encryptionPassword?: string;
}

/**
 * Node version 3+ takes the budget from the credential. Fails early with a clear message
 * instead of letting an empty ID surface as an obscure Actual error.
 */
export function requireCredentialBudgetId(
	context: { getNode(): INode },
	auth: Credentials,
): string {
	const budgetId = auth.budgetId?.trim();
	if (!budgetId) {
		throw new NodeOperationError(
			context.getNode(),
			'This credential has no Budget ID. Set the Budget ID on the Actual Budget API credential (one credential per budget).',
		);
	}
	return budgetId;
}

/**
 * Downloads a budget, supplying the end-to-end encryption password when one is configured.
 * Without one, the call is identical to a plain downloadBudget(id) so unencrypted budgets
 * are unaffected.
 */
export async function downloadBudgetWithAuth(auth: Credentials, budgetId: string): Promise<void> {
	if (auth.encryptionPassword) {
		await downloadBudget(budgetId, { password: auth.encryptionPassword });
	} else {
		await downloadBudget(budgetId);
	}
}

/**
 * Builds a resourceLocator field with the standard "search by name" / "paste a raw ID"
 * modes used throughout this node (Account, Category, Category Group, Payee, ...).
 */
export function resourceLocatorField(options: {
	displayName: string;
	name: string;
	searchListMethod: string;
	displayOptions: IDisplayOptions;
	description?: string;
	required?: boolean;
}): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: options.required,
		description: options.description,
		displayOptions: options.displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: options.searchListMethod,
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
			},
		],
	};
}

async function initializeActualBudget(auth: Credentials): Promise<void> {
	await init({
		serverURL: auth.url,
		password: auth.password,
	});
}

/**
 * Runs `fn` against a freshly initialized+downloaded budget, serialized against every
 * other execute()/listSearch call via the shared runExclusive queue, and always shuts the
 * session down afterwards.
 */
export async function withBudgetSession<T>(
	auth: Credentials,
	budgetId: string,
	fn: () => Promise<T>,
): Promise<T> {
	return runExclusive(async () => {
		await initializeActualBudget(auth);
		try {
			await downloadBudgetWithAuth(auth, budgetId);
			return await fn();
		} finally {
			await shutdown();
		}
	});
}
