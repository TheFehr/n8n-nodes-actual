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

import { transactionOperation, transactionFields, executeTransaction } from './actions/transaction';
import { budgetOperation, budgetFields, executeBudget } from './actions/budget';

interface Credentials {
	url: string;
	password: string;
}

// @actual-app/api stores its session (DB connection, sync clock) in a module-level
// singleton shared by every execution of this node in the process. Running two
// executions concurrently lets one's init()/shutdown() tear down state the other is
// mid-operation on, so all executions are funneled through this queue to run one at a time.
let executionQueue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
	const result = executionQueue.then(fn, fn);
	executionQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

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
						name: 'Budget',
						value: 'budget',
					},
					{
						name: 'Transaction',
						value: 'transaction',
					},
				],
				default: 'transaction',
				required: true,
			},
			transactionOperation,
			budgetOperation,
			...transactionFields,
			...budgetFields,
		],
		usableAsTool: undefined,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// @actual-app/api keeps its session (DB connection, sync clock) in a module-level
		// singleton, so two executions running at once in this process would tear down or
		// reinitialize each other's state mid-operation. Serialize executions to avoid that.
		const continueOnFail = this.continueOnFail();
		return runExclusive(() => runActualBudget(this, continueOnFail));
	}
}

async function runActualBudget(
	context: IExecuteFunctions,
	continueOnFail: boolean,
): Promise<INodeExecutionData[][]> {
	const items = context.getInputData();
	const returnData = [];

	const resource = context.getNodeParameter('resource', 0) as string;
	const operation = context.getNodeParameter('operation', 0) as string;
	const auth = (await context.getCredentials('actualBudgetApi', 0)) as Credentials;
	await initializeActualBudget(auth);

	try {
		const budgetId = context.getNodeParameter('budgetId', 0) as string;

		await downloadBudget(budgetId);

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
		case 'transaction':
			return executeTransaction(context, itemIndex, operation);
		case 'budget':
			return executeBudget(context, itemIndex, operation);
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
