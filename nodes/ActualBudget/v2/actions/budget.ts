import {
	IDataObject,
	IExecuteFunctions,
	INodeProperties,
	NodeOperationError,
} from 'n8n-workflow';

import {
	getBudgetMonth,
	getBudgetMonths,
	getBudgets,
	getPreferences,
	getServerVersion,
	holdBudgetForNextMonth,
	resetBudgetHold,
	runBankSync,
	setBudgetAmount,
	setBudgetCarryover,
	sync,
} from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

export const budgetOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['budget'],
		},
	},
	options: [
		{
			name: 'Get Budget Files',
			value: 'getBudgets',
			action: 'Get all budget files available on the server',
		},
		{
			name: 'Get Month',
			value: 'getBudgetMonth',
			action: 'Get budget data for a specific month',
		},
		{
			name: 'Get Months',
			value: 'getBudgetMonths',
			action: 'Get all budget months',
		},
		{
			name: 'Get Preferences',
			value: 'getPreferences',
			action: 'Get the synced budget preferences',
		},
		{
			name: 'Get Server Version',
			value: 'getServerVersion',
			action: 'Get the actual server version',
		},
		{
			name: 'Hold for Next Month',
			value: 'holdBudgetForNextMonth',
			action: 'Hold available funds for next month',
		},
		{
			name: 'Reset Hold',
			value: 'resetBudgetHold',
			action: 'Reset the hold for next month',
		},
		{
			name: 'Run Bank Sync',
			value: 'runBankSync',
			action: 'Sync bank linked accounts',
		},
		{
			name: 'Set Amount',
			value: 'setBudgetAmount',
			action: 'Set the budget amount for a category in a specific month',
		},
		{
			name: 'Set Carryover',
			value: 'setBudgetCarryover',
			action: 'Set the carryover flag for a category in a specific month',
		},
		{
			name: 'Sync',
			value: 'sync',
			action: 'Sync the current budget',
		},
	],
	default: 'getBudgetMonth',
};

export const budgetFields: INodeProperties[] = [
	{
		displayName: 'Month',
		name: 'month',
		type: 'string',
		default: '',
		required: true,
		description: 'Month in YYYY-MM format',
		displayOptions: {
			show: {
				resource: ['budget'],
				operation: [
					'getBudgetMonth',
					'setBudgetAmount',
					'setBudgetCarryover',
					'holdBudgetForNextMonth',
					'resetBudgetHold',
				],
			},
		},
	},
	resourceLocatorField({
		displayName: 'Category',
		name: 'categoryId',
		description: 'The budget category',
		searchListMethod: 'searchCategories',
		required: true,
		displayOptions: {
			show: {
				resource: ['budget'],
				operation: ['setBudgetAmount', 'setBudgetCarryover'],
			},
		},
	}),
	{
		displayName: 'Amount',
		name: 'amount',
		type: 'number',
		default: 0,
		required: true,
		description: 'Budget amount in millicents (e.g. 100000 = $100.00)',
		displayOptions: {
			show: {
				resource: ['budget'],
				operation: ['setBudgetAmount', 'holdBudgetForNextMonth'],
			},
		},
	},
	{
		displayName: 'Carryover',
		name: 'carryover',
		type: 'boolean',
		default: true,
		description: 'Whether to carry over this category\'s balance into the next month',
		displayOptions: {
			show: {
				resource: ['budget'],
				operation: ['setBudgetCarryover'],
			},
		},
	},
	resourceLocatorField({
		displayName: 'Account',
		name: 'accountId',
		description: 'The Account to sync (leave empty to sync all bank-linked accounts)',
		searchListMethod: 'searchAccounts',
		displayOptions: {
			show: {
				resource: ['budget'],
				operation: ['runBankSync'],
			},
		},
	}),
];

export async function executeBudget(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getBudgetMonth':
			return handleGetBudgetMonth(context, itemIndex);
		case 'setBudgetAmount':
			return handleSetBudgetAmount(context, itemIndex);
		case 'setBudgetCarryover':
			return handleSetBudgetCarryover(context, itemIndex);
		case 'holdBudgetForNextMonth':
			return handleHoldBudgetForNextMonth(context, itemIndex);
		case 'resetBudgetHold':
			return handleResetBudgetHold(context, itemIndex);
		case 'getBudgetMonths':
			return (await getBudgetMonths()) as unknown as IDataObject[];
		case 'getBudgets':
			return (await getBudgets()) as unknown as IDataObject[];
		case 'sync':
			await sync();
			return { success: true };
		case 'runBankSync':
			return handleRunBankSync(context, itemIndex);
		case 'getServerVersion':
			return (await getServerVersion()) as unknown as IDataObject;
		case 'getPreferences':
			return (await getPreferences()) as unknown as IDataObject;
		default:
			throw new NodeOperationError(context.getNode(), `Unknown budget operation "${operation}"`);
	}
}

async function handleGetBudgetMonth(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const month = context.getNodeParameter('month', itemIndex) as string;
	return (await getBudgetMonth(month)) as unknown as IDataObject;
}

async function handleSetBudgetAmount(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const month = context.getNodeParameter('month', itemIndex) as string;
	const categoryId = context.getNodeParameter('categoryId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const amount = context.getNodeParameter('amount', itemIndex) as number;
	if (!Number.isInteger(amount)) {
		throw new NodeOperationError(context.getNode(), '"amount" must be an integer number of millicents');
	}
	await setBudgetAmount(month, categoryId, amount);
	return { success: true, month, categoryId, amount };
}

async function handleSetBudgetCarryover(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const month = context.getNodeParameter('month', itemIndex) as string;
	const categoryId = context.getNodeParameter('categoryId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const carryover = context.getNodeParameter('carryover', itemIndex) as boolean;
	await setBudgetCarryover(month, categoryId, carryover);
	return { success: true, month, categoryId, carryover };
}

async function handleHoldBudgetForNextMonth(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const month = context.getNodeParameter('month', itemIndex) as string;
	const amount = context.getNodeParameter('amount', itemIndex) as number;
	const success = await holdBudgetForNextMonth(month, amount);
	return { success, month, amount };
}

async function handleResetBudgetHold(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const month = context.getNodeParameter('month', itemIndex) as string;
	await resetBudgetHold(month);
	return { success: true, month };
}

async function handleRunBankSync(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = context.getNodeParameter('accountId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	await runBankSync(accountId ? { accountId } : undefined);
	return { success: true, accountId: accountId || null };
}
