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

import { init, downloadBudget, shutdown } from '@actual-app/api';

import { runExclusive } from '../executionQueue';

import { Credentials } from './GenericFunctions';

import { accountOperation, accountFields, executeAccount } from './actions/account';
import { budgetOperation, budgetFields, executeBudget } from './actions/budget';
import { categoryOperation, categoryFields, executeCategory } from './actions/category';
import {
	categoryGroupOperation,
	categoryGroupFields,
	executeCategoryGroup,
} from './actions/categoryGroup';
import { payeeOperation, payeeFields, executePayee } from './actions/payee';
import { ruleOperation, ruleFields, executeRule } from './actions/rule';
import { scheduleOperation, scheduleFields, executeSchedule } from './actions/schedule';
import { transactionOperation, transactionFields, executeTransaction } from './actions/transaction';

import { searchAccounts, searchCategories, searchCategoryGroups, searchPayees } from './methods/listSearch';

export class ActualBudgetV2 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ActualBudget',
		name: 'actualBudget',
		icon: 'file:../actualbudget.svg',
		group: ['transform'],
		version: 2,
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
						name: 'Rule',
						value: 'rule',
					},
					{
						name: 'Schedule',
						value: 'schedule',
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
			ruleOperation,
			scheduleOperation,
			transactionOperation,
			...accountFields,
			...budgetFields,
			...categoryFields,
			...categoryGroupFields,
			...payeeFields,
			...ruleFields,
			...scheduleFields,
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
		// @actual-app/api keeps its session (DB connection, sync clock) in a module-level
		// singleton, so two executions running at once in this process would tear down or
		// reinitialize each other's state mid-operation. Serialize executions to avoid that
		// - and V1 executions share this same queue (see ../executionQueue.ts).
		const continueOnFail = this.continueOnFail();
		return runExclusive(() => runActualBudget(this, continueOnFail));
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
	await initializeActualBudget(auth);

	try {
		let loadedBudgetId: string | undefined;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const budgetId = context.getNodeParameter('budgetId', itemIndex) as string;
				if (budgetId !== loadedBudgetId) {
					await downloadBudget(budgetId);
					loadedBudgetId = budgetId;
				}

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
	} finally {
		await shutdown();
	}
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
		case 'rule':
			return executeRule(context, itemIndex, operation);
		case 'schedule':
			return executeSchedule(context, itemIndex, operation);
		case 'transaction':
			return executeTransaction(context, itemIndex, operation);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown resource "${resource}"`);
	}
}

async function initializeActualBudget(auth: Credentials): Promise<void> {
	await init({
		serverURL: auth.url,
		password: auth.password,
	});
}
