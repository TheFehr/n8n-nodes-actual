import {
	IDataObject,
	IExecuteFunctions,
	INodeProperties,
	NodeOperationError,
} from 'n8n-workflow';

import { getBudgetMonth, setBudgetAmount } from '@actual-app/api';

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
			name: 'Get Month',
			value: 'getBudgetMonth',
			action: 'Get budget data for a specific month',
		},
		{
			name: 'Set Amount',
			value: 'setBudgetAmount',
			action: 'Set the budget amount for a category in a specific month',
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
				operation: ['getBudgetMonth', 'setBudgetAmount'],
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
				operation: ['setBudgetAmount'],
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
				operation: ['setBudgetAmount'],
			},
		},
	},
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
