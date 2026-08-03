import {
	IDataObject,
	IExecuteFunctions,
	INodeProperties,
	NodeOperationError,
} from 'n8n-workflow';

import { addTransactions, deleteTransaction, getTransactions, importTransactions, updateTransaction } from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

export interface ActualTransaction {
	date: string;
	amount: number;
	payee?: string;
	payee_name?: string;
	imported_payee?: string;
	category?: string;
	notes?: string;
	cleared?: boolean;
	imported_id?: string;
}

export const transactionOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['transaction'],
		},
	},
	options: [
		{
			name: 'Add',
			value: 'addTransactions',
			action: 'Add a list of transactions to an account',
		},
		{
			name: 'Delete',
			value: 'deleteTransaction',
			action: 'Delete a transaction',
		},
		{
			name: 'Get Many',
			value: 'getTransactions',
			action: 'Get transactions from an account within a date range',
		},
		{
			name: 'Import',
			value: 'importTransactions',
			action: 'Import a list of transactions into your budget',
		},
		{
			name: 'Update',
			value: 'updateTransaction',
			action: 'Update a transaction',
		},
	],
	default: 'importTransactions',
};

export const transactionFields: INodeProperties[] = [
	resourceLocatorField({
		displayName: 'Account',
		name: 'accountId',
		description: 'The Account you are working on/with',
		searchListMethod: 'searchAccounts',
		required: true,
		displayOptions: {
			show: {
				resource: ['transaction'],
				operation: ['importTransactions', 'getTransactions', 'addTransactions'],
			},
		},
	}),
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'string',
		default: '',
		required: true,
		description: 'Start date in YYYY-MM-DD format (inclusive)',
		displayOptions: {
			show: {
				resource: ['transaction'],
				operation: ['getTransactions'],
			},
		},
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'string',
		default: '',
		required: true,
		description: 'End date in YYYY-MM-DD format (inclusive)',
		displayOptions: {
			show: {
				resource: ['transaction'],
				operation: ['getTransactions'],
			},
		},
	},
	{
		displayName: 'Transactions',
		name: 'transactions',
		type: 'json',
		default: '[]',
		required: true,
		displayOptions: {
			show: {
				resource: ['transaction'],
				operation: ['importTransactions', 'addTransactions'],
			},
		},
	},
	{
		displayName: 'Learn Categories',
		name: 'learnCategories',
		type: 'boolean',
		default: false,
		description: 'Whether Actual should learn payee-to-category associations from these transactions',
		displayOptions: {
			show: {
				resource: ['transaction'],
				operation: ['addTransactions'],
			},
		},
	},
	{
		displayName: 'Run Transfers',
		name: 'runTransfers',
		type: 'boolean',
		default: false,
		description: 'Whether to detect and link transfers between accounts',
		displayOptions: {
			show: {
				resource: ['transaction'],
				operation: ['addTransactions'],
			},
		},
	},
	{
		displayName: 'Transaction ID',
		name: 'transactionId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the transaction (see the Transaction "Get Many" operation to look it up)',
		displayOptions: {
			show: {
				resource: ['transaction'],
				operation: ['updateTransaction', 'deleteTransaction'],
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
				resource: ['transaction'],
				operation: ['updateTransaction'],
			},
		},
		options: [
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Category ID',
				name: 'category',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Cleared',
				name: 'cleared',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Date',
				name: 'date',
				type: 'string',
				default: '',
				description: 'Date in YYYY-MM-DD format',
			},
			{
				displayName: 'Notes',
				name: 'notes',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Payee ID',
				name: 'payee',
				type: 'string',
				default: '',
			},
		],
	},
];

export async function executeTransaction(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getTransactions':
			return handleGetTransactions(context, itemIndex);
		case 'importTransactions':
			return handleImportTransactions(context, itemIndex);
		case 'addTransactions':
			return handleAddTransactions(context, itemIndex);
		case 'updateTransaction':
			return handleUpdateTransaction(context, itemIndex);
		case 'deleteTransaction':
			return handleDeleteTransaction(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown transaction operation "${operation}"`);
	}
}

function getAccountId(context: IExecuteFunctions, itemIndex: number): string {
	return context.getNodeParameter('accountId', itemIndex, undefined, { extractValue: true }) as string;
}

function parseTransactionsInput(context: IExecuteFunctions, itemIndex: number): ActualTransaction[] {
	const raw = context.getNodeParameter('transactions', itemIndex);
	let parsed: unknown;
	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new NodeOperationError(context.getNode(), 'Transactions field contains invalid JSON');
		}
	} else {
		parsed = raw;
	}
	if (!Array.isArray(parsed)) {
		throw new NodeOperationError(context.getNode(), `"transactions" must be a JSON array, got ${typeof parsed}`);
	}
	for (const item of parsed) {
		if (typeof item !== 'object' || item === null || !('date' in item) || !('amount' in item)) {
			throw new NodeOperationError(context.getNode(), 'Each transaction must have "date" and "amount" fields');
		}
	}
	return parsed as ActualTransaction[];
}

async function handleGetTransactions(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const accountId = getAccountId(context, itemIndex);
	const startDate = context.getNodeParameter('startDate', itemIndex) as string;
	const endDate = context.getNodeParameter('endDate', itemIndex) as string;
	const datePattern = /^\d{4}-\d{2}-\d{2}$/;
	if (!datePattern.test(startDate)) {
		throw new NodeOperationError(context.getNode(), `"startDate" must be in YYYY-MM-DD format, got "${startDate}"`);
	}
	if (!datePattern.test(endDate)) {
		throw new NodeOperationError(context.getNode(), `"endDate" must be in YYYY-MM-DD format, got "${endDate}"`);
	}
	if (startDate > endDate) {
		throw new NodeOperationError(context.getNode(), `"startDate" (${startDate}) must be on or before "endDate" (${endDate})`);
	}
	return (await getTransactions(accountId, startDate, endDate)) as unknown as IDataObject[];
}

async function handleImportTransactions(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = getAccountId(context, itemIndex);
	const transactions = parseTransactionsInput(context, itemIndex);
	return (await importTransactions(accountId, transactions)) as unknown as IDataObject;
}

async function handleAddTransactions(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = getAccountId(context, itemIndex);
	const transactions = parseTransactionsInput(context, itemIndex);
	const learnCategories = context.getNodeParameter('learnCategories', itemIndex) as boolean;
	const runTransfers = context.getNodeParameter('runTransfers', itemIndex) as boolean;
	const result = await addTransactions(accountId, transactions, { learnCategories, runTransfers });
	return { result };
}

async function handleUpdateTransaction(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = context.getNodeParameter('transactionId', itemIndex) as string;
	const fields = context.getNodeParameter('updateFields', itemIndex) as IDataObject;
	const result = await updateTransaction(id, fields);
	return { success: true, id, result } as unknown as IDataObject;
}

async function handleDeleteTransaction(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = context.getNodeParameter('transactionId', itemIndex) as string;
	await deleteTransaction(id);
	return { success: true, id };
}
