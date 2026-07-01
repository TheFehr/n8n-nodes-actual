import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import {
	init,
	downloadBudget,
	importTransactions,
	getTransactions,
	getBudgetMonth,
	setBudgetAmount,
	shutdown,
} from '@actual-app/api';

import { ensureNativeBinding } from './ensureNativeBinding';

interface ActualTransaction {
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
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{
						name: 'Get Budget Month',
						value: 'getBudgetMonth',
						action: 'Get budget data for a specific month',
					},
					{
						name: 'Get Transactions',
						value: 'getTransactions',
						action: 'Get transactions from an account within a date range',
					},
					{
						name: 'Import Transactions',
						value: 'importTransactions',
						action: 'Import a list of transactions into your budget',
					},
					{
						name: 'Set Budget Amount',
						value: 'setBudgetAmount',
						action: 'Set the budget amount for a category in a specific month',
					},
				],
				default: 'importTransactions',
				required: true,
				noDataExpression: true,
			},
			{
				displayName: 'Account ID',
				description: 'The ID of the Account you are working on/with',
				name: 'accountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
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
						operation: ['importTransactions'],
					},
				},
			},
			{
				displayName: 'Month',
				name: 'month',
				type: 'string',
				default: '',
				required: true,
				description: 'Month in YYYY-MM format',
				displayOptions: {
					show: {
						operation: ['getBudgetMonth', 'setBudgetAmount'],
					},
				},
			},
			{
				displayName: 'Category ID',
				name: 'categoryId',
				type: 'string',
				default: '',
				required: true,
				description: 'The ID of the budget category',
				displayOptions: {
					show: {
						operation: ['setBudgetAmount'],
					},
				},
			},
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				default: 0,
				required: true,
				description: 'Budget amount in millicents (e.g. 100000 = $100.00)',
				displayOptions: {
					show: {
						operation: ['setBudgetAmount'],
					},
				},
			},
		],
		usableAsTool: undefined,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// @actual-app/api keeps its session (DB connection, sync clock) in a module-level
		// singleton, so two executions running at once in this process would tear down or
		// reinitialize each other's state mid-operation. Serialize executions to avoid that.
		return runExclusive(() => runActualBudget(this));
	}
}

async function runActualBudget(context: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = context.getInputData();
	const returnData = [];

	const action = context.getNodeParameter('operation', 0) as string;
	const auth = (await context.getCredentials('actualBudgetApi', 0)) as Credentials;
	await initializeActualBudget(auth);

	try {
		const budgetId = context.getNodeParameter('budgetId', 0) as string;

		await downloadBudget(budgetId);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let elementData;
				switch (action) {
					case 'getBudgetMonth':
						elementData = await handleGetBudgetMonth(context, itemIndex);
						returnData.push(elementData);
						break;
					case 'getTransactions':
						returnData.push(...(await handleGetTransactions(context, itemIndex)));
						break;
					case 'importTransactions':
						elementData = await handleBudgetImport(context, itemIndex);
						returnData.push(elementData);
						break;
					case 'setBudgetAmount':
						elementData = await handleSetBudgetAmount(context, itemIndex);
						returnData.push(elementData);
						break;
				}
			} catch (error) {
				if (context.continueOnFail()) {
					const executionData = context.helpers.constructExecutionMetaData(
						context.helpers.returnJsonArray({ error: error.message }),
						{ itemData: { item: itemIndex } },
					);
					returnData.push(...executionData);
					continue;
				}
				throw error;
			}
		}

		return [context.helpers.returnJsonArray(returnData)];
	} finally {
		await shutdown();
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
	const categoryId = context.getNodeParameter('categoryId', itemIndex) as string;
	const amount = context.getNodeParameter('amount', itemIndex) as number;
	await setBudgetAmount(month, categoryId, amount);
	return { success: true, month, categoryId, amount };
}

async function initializeActualBudget(auth: Credentials): Promise<void> {
	ensureNativeBinding();
	await init({
		serverURL: auth.url,
		password: auth.password,
	});
}

async function handleBudgetImport(
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
