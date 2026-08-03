import {
	IDataObject,
	IExecuteFunctions,
	INodeProperties,
	NodeOperationError,
} from 'n8n-workflow';

import { getTransactions, importTransactions } from '@actual-app/api';

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
			name: 'Get Many',
			value: 'getTransactions',
			action: 'Get transactions from an account within a date range',
		},
		{
			name: 'Import',
			value: 'importTransactions',
			action: 'Import a list of transactions into your budget',
		},
	],
	default: 'importTransactions',
};

export const transactionFields: INodeProperties[] = [
	{
		displayName: 'Account ID',
		description: 'The ID of the Account you are working on/with',
		name: 'accountId',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['transaction'],
				operation: ['importTransactions', 'getTransactions'],
			},
		},
		required: true,
	},
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
				operation: ['importTransactions'],
			},
		},
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
		default:
			throw new NodeOperationError(context.getNode(), `Unknown transaction operation "${operation}"`);
	}
}

async function handleGetTransactions(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const accountId = context.getNodeParameter('accountId', itemIndex) as string;
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
	const accountId = context.getNodeParameter('accountId', itemIndex) as string;
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
	const transactions = parsed as ActualTransaction[];

	return (await importTransactions(accountId, transactions)) as unknown as IDataObject;
}
