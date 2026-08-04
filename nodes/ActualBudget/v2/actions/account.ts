import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import {
	closeAccount,
	createAccount,
	deleteAccount,
	getAccountBalance,
	getAccounts,
	reopenAccount,
	updateAccount,
} from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

export const accountOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['account'],
		},
	},
	options: [
		{
			name: 'Close',
			value: 'closeAccount',
			action: 'Close an account',
		},
		{
			name: 'Create',
			value: 'createAccount',
			action: 'Create an account',
		},
		{
			name: 'Delete',
			value: 'deleteAccount',
			action: 'Delete an account',
		},
		{
			name: 'Get Balance',
			value: 'getAccountBalance',
			action: 'Get the balance of an account',
		},
		{
			name: 'Get Many',
			value: 'getAccounts',
			action: 'Get all accounts',
		},
		{
			name: 'Reopen',
			value: 'reopenAccount',
			action: 'Reopen a closed account',
		},
		{
			name: 'Update',
			value: 'updateAccount',
			action: 'Update an account',
		},
	],
	default: 'getAccounts',
};

const accountLocator = (operations: string[]) =>
	resourceLocatorField({
		displayName: 'Account',
		name: 'accountId',
		description: 'The Account to operate on',
		searchListMethod: 'searchAccounts',
		required: true,
		displayOptions: {
			show: {
				resource: ['account'],
				operation: operations,
			},
		},
	});

export const accountFields: INodeProperties[] = [
	accountLocator(['updateAccount', 'closeAccount', 'reopenAccount', 'deleteAccount', 'getAccountBalance']),
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['createAccount'],
			},
		},
	},
	{
		displayName: 'Off Budget',
		name: 'offbudget',
		type: 'boolean',
		default: false,
		description: 'Whether the account is off-budget (e.g. a tracking/investment account)',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['createAccount'],
			},
		},
	},
	{
		displayName: 'Initial Balance',
		name: 'initialBalance',
		type: 'number',
		default: 0,
		description: 'Initial account balance, in cents',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['createAccount'],
			},
		},
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['updateAccount'],
			},
		},
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Off Budget',
				name: 'offbudget',
				type: 'boolean',
				default: false,
			},
		],
	},
	resourceLocatorField({
		displayName: 'Transfer Account',
		name: 'transferAccountId',
		description: 'Account to transfer this account\'s balance to on close, if any',
		searchListMethod: 'searchAccounts',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['closeAccount'],
			},
		},
	}),
	resourceLocatorField({
		displayName: 'Transfer Category',
		name: 'transferCategoryId',
		description: 'Category to assign the transferred balance to, if any',
		searchListMethod: 'searchCategories',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['closeAccount'],
			},
		},
	}),
	{
		displayName: 'Cutoff Date',
		name: 'cutoff',
		type: 'dateTime',
		default: '',
		description: 'Only count transactions up to this date, if set',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['getAccountBalance'],
			},
		},
	},
];

export async function executeAccount(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getAccounts':
			return (await getAccounts()) as unknown as IDataObject[];
		case 'createAccount':
			return handleCreateAccount(context, itemIndex);
		case 'updateAccount':
			return handleUpdateAccount(context, itemIndex);
		case 'closeAccount':
			return handleCloseAccount(context, itemIndex);
		case 'reopenAccount':
			return handleReopenAccount(context, itemIndex);
		case 'deleteAccount':
			return handleDeleteAccount(context, itemIndex);
		case 'getAccountBalance':
			return handleGetAccountBalance(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown account operation "${operation}"`);
	}
}

function getAccountId(context: IExecuteFunctions, itemIndex: number): string {
	return context.getNodeParameter('accountId', itemIndex, undefined, { extractValue: true }) as string;
}

async function handleCreateAccount(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const name = context.getNodeParameter('name', itemIndex) as string;
	const offbudget = context.getNodeParameter('offbudget', itemIndex) as boolean;
	const initialBalance = context.getNodeParameter('initialBalance', itemIndex) as number;
	const id = await createAccount({ name, offbudget }, initialBalance);
	return { id, name, offbudget };
}

async function handleUpdateAccount(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getAccountId(context, itemIndex);
	const fields = context.getNodeParameter('updateFields', itemIndex) as IDataObject;
	await updateAccount(id, fields);
	return { success: true, id, ...fields };
}

async function handleCloseAccount(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getAccountId(context, itemIndex);
	const transferAccountId = context.getNodeParameter('transferAccountId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const transferCategoryId = context.getNodeParameter('transferCategoryId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	await closeAccount(id, transferAccountId || undefined, transferCategoryId || undefined);
	return { success: true, id };
}

async function handleReopenAccount(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getAccountId(context, itemIndex);
	await reopenAccount(id);
	return { success: true, id };
}

async function handleDeleteAccount(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getAccountId(context, itemIndex);
	await deleteAccount(id);
	return { success: true, id };
}

async function handleGetAccountBalance(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getAccountId(context, itemIndex);
	const cutoff = context.getNodeParameter('cutoff', itemIndex) as string;
	const balance = await getAccountBalance(id, cutoff ? new Date(cutoff) : undefined);
	return { id, balance };
}
