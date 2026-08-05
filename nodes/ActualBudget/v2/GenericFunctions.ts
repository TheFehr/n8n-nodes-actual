import { IDisplayOptions, INodeProperties } from 'n8n-workflow';

import { init, downloadBudget, shutdown } from '@actual-app/api';

import { runExclusive } from '../executionQueue';

export interface Credentials {
	url: string;
	password: string;
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
			await downloadBudget(budgetId);
			return await fn();
		} finally {
			await shutdown();
		}
	});
}
