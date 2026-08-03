import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { Credentials, withBudgetSession } from './GenericFunctions';

import { accountOperation, accountFields, executeAccount } from './actions/account';
import { budgetOperation, budgetFields, executeBudget } from './actions/budget';
import { categoryOperation, categoryFields, executeCategory } from './actions/category';
import {
	categoryGroupOperation,
	categoryGroupFields,
	executeCategoryGroup,
} from './actions/categoryGroup';
import { payeeOperation, payeeFields, executePayee } from './actions/payee';
import { transactionOperation, transactionFields, executeTransaction } from './actions/transaction';

import { searchAccounts, searchCategories, searchCategoryGroups, searchPayees } from './methods/listSearch';

export class ActualBudget implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ActualBudget',
		name: 'actualBudget',
		icon: 'file:actualbudget.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + " " + $parameter["resource"]}}',
		description: 'Consume ActualBudget API',
		defaults: {
			name: 'ActualBudget',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'actualBudgetApi',
				required: true,
			},
		],

		properties: [
			{
				displayName: 'Budget ID',
				description: 'The ID of the Budget you are working on/with',
				name: 'budgetId',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Account',
						value: 'account',
					},
					{
						name: 'Budget',
						value: 'budget',
					},
					{
						name: 'Category',
						value: 'category',
					},
					{
						name: 'Category Group',
						value: 'categoryGroup',
					},
					{
						name: 'Payee',
						value: 'payee',
					},
					{
						name: 'Transaction',
						value: 'transaction',
					},
				],
				default: 'transaction',
				required: true,
			},
			accountOperation,
			budgetOperation,
			categoryOperation,
			categoryGroupOperation,
			payeeOperation,
			transactionOperation,
			...accountFields,
			...budgetFields,
			...categoryFields,
			...categoryGroupFields,
			...payeeFields,
			...transactionFields,
		],
		usableAsTool: undefined,
	};

	methods = {
		listSearch: {
			searchAccounts,
			searchCategories,
			searchCategoryGroups,
			searchPayees,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const continueOnFail = this.continueOnFail();
		return runActualBudget(this, continueOnFail);
	}
}

async function runActualBudget(
	context: IExecuteFunctions,
	continueOnFail: boolean,
): Promise<INodeExecutionData[][]> {
	const items = context.getInputData();
	const returnData: IDataObject[] = [];

	const resource = context.getNodeParameter('resource', 0) as string;
	const operation = context.getNodeParameter('operation', 0) as string;
	const auth = (await context.getCredentials('actualBudgetApi', 0)) as Credentials;
	const budgetId = context.getNodeParameter('budgetId', 0) as string;

	return withBudgetSession(auth, budgetId, async () => {
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const elementData = await dispatch(context, itemIndex, resource, operation);
				if (Array.isArray(elementData)) {
					returnData.push(...elementData);
				} else {
					returnData.push(elementData);
				}
			} catch (error) {
				if (continueOnFail) {
					const executionData = context.helpers.constructExecutionMetaData(
						context.helpers.returnJsonArray({ error: error.message }),
						{ itemData: { item: itemIndex } },
					);
					returnData.push(...executionData);
					continue;
				}
				// Validation failures from the resource handlers are already NodeOperationError
				// with a user-facing message; only wrap other (API/unknown) errors, so validation
				// errors aren't reported to the user as API failures.
				if (error instanceof NodeOperationError) {
					throw error as NodeOperationError;
				}
				throw new NodeApiError(context.getNode(), error as JsonObject);
			}
		}

		return [context.helpers.returnJsonArray(returnData)];
	});
}

async function dispatch(
	context: IExecuteFunctions,
	itemIndex: number,
	resource: string,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (resource) {
		case 'account':
			return executeAccount(context, itemIndex, operation);
		case 'budget':
			return executeBudget(context, itemIndex, operation);
		case 'category':
			return executeCategory(context, itemIndex, operation);
		case 'categoryGroup':
			return executeCategoryGroup(context, itemIndex, operation);
		case 'payee':
			return executePayee(context, itemIndex, operation);
		case 'transaction':
			return executeTransaction(context, itemIndex, operation);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown resource "${resource}"`);
	}
}
