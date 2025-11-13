import * as crypto from 'crypto';
import * as fs from 'fs';
import {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

interface Credentials {
	url: string;
	password: string;
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
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
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
					{
						name: 'Utility',
						value: 'utility',
					},
				],
				default: 'account',
				required: true,
				noDataExpression: true,
			},
			{
				displayName: 'Budget ID',
				description: 'The ID of the Budget you are working on/with',
				name: 'budgetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['account', 'budget', 'category', 'categoryGroup', 'payee', 'rule', 'schedule', 'transaction', 'utility'],
					},
				},
			},
			{
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
						name: 'Get All',
						value: 'getAll',
						action: 'Get all accounts',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create an account',
					},
					{
						name: 'Get Balance',
						value: 'getBalance',
						action: 'Get account balance',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update an account',
					},
					{
						name: 'Close',
						value: 'close',
						action: 'Close an account',
					},
					{
						name: 'Reopen',
						value: 'reopen',
						action: 'Reopen an account',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete an account',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Account ID',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description: 'The ID of the account to operate on.',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['getBalance', 'update', 'close', 'reopen', 'delete'],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The name of the account.',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{
						name: 'Checking',
						value: 'checking',
					},
					{
						name: 'Savings',
						value: 'savings',
					},
					{
						name: 'Cash',
						value: 'cash',
					},
					{
						name: 'Credit Card',
						value: 'creditCard',
					},
					{
						name: 'Line of Credit',
						value: 'lineOfCredit',
					},
					{
						name: 'Loan',
						value: 'loan',
					},
					{
						name: 'Mortgage',
						value: 'mortgage',
					},
					{
						name: 'Investment',
						value: 'investment',
					},
					{
						name: 'Other',
						value: 'other',
					},
				],
				default: 'checking',
				description: 'The type of the account.',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Off-Budget',
				name: 'offbudget',
				type: 'boolean',
				default: false,
				description: 'Whether the account is off-budget.',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'FinTS',
				name: 'fints',
				type: 'boolean',
				default: false,
				description: 'Whether the account uses FinTS.',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Closed',
				name: 'closed',
				type: 'boolean',
				default: false,
				description: 'Whether the account is closed.',
				displayOptions: {
					show: {
						resource: ['account'],
						operation: ['create', 'update'],
					},
				},
			},
			{
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
						name: 'Get Months',
						value: 'getMonths',
						action: 'Get budget months',
					},
					{
						name: 'Get Month',
						value: 'getMonth',
						action: 'Get budget month',
					},
					{
						name: 'Set Amount',
						value: 'setAmount',
						action: 'Set budget amount',
					},
					{
						name: 'Set Carryover',
						value: 'setCarryover',
						action: 'Set budget carryover',
					},
					{
						name: 'Hold For Next Month',
						value: 'holdForNextMonth',
						action: 'Hold budget for next month',
					},
					{
						name: 'Reset Hold',
						value: 'resetHold',
						action: 'Reset budget hold',
					},
					{
						name: 'Load',
						value: 'load',
						action: 'Load budget',
					},
					{
						name: 'Download',
						value: 'download',
						action: 'Download budget',
					},
					{
						name: 'Batch Updates',
						value: 'batchUpdates',
						action: 'Batch budget updates',
					},
				],
				default: 'getMonths',
			},
			{
				displayName: 'Month',
				name: 'month',
				type: 'string',
				default: '',
				description: 'The month to operate on (YYYY-MM-DD format).',
				displayOptions: {
					show: {
						resource: ['budget'],
						operation: ['getMonth', 'setAmount', 'setCarryover', 'holdForNextMonth', 'resetHold'],
					},
				},
			},
			{
				displayName: 'Category ID',
				name: 'categoryId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategories',
				},
				default: '',
				description: 'The ID of the category to operate on.',
				displayOptions: {
					show: {
						resource: ['budget'],
						operation: ['setAmount', 'setCarryover', 'holdForNextMonth', 'resetHold'],
					},
				},
			},
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				default: 0,
				description: 'The amount to set for the category in cents.',
				displayOptions: {
					show: {
						resource: ['budget'],
						operation: ['setAmount'],
					},
				},
			},
			{
				displayName: 'Carryover',
				name: 'carryover',
				type: 'boolean',
				default: false,
				description: 'Whether to carryover the budget.',
				displayOptions: {
					show: {
						resource: ['budget'],
						operation: ['setCarryover'],
					},
				},
			},
			{
				displayName: 'Updates',
				name: 'updates',
				type: 'json',
				default: '[]',
				description: 'JSON array of budget updates.',
				displayOptions: {
					show: {
						resource: ['budget'],
						operation: ['batchUpdates'],
					},
				},
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['category'],
					},
				},
				options: [
					{
						name: 'Get All',
						value: 'getAll',
						action: 'Get all categories',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create a category',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a category',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a category',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Category ID',
				name: 'categoryId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategories',
				},
				default: '',
				description: 'The ID of the category to operate on.',
				displayOptions: {
					show: {
						resource: ['category'],
						operation: ['update', 'delete'],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The name of the category.',
				displayOptions: {
					show: {
						resource: ['category'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Category Group ID',
				name: 'categoryGroupId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategoryGroups',
				},
				default: '',
				description: 'The ID of the category group the category belongs to.',
				displayOptions: {
					show: {
						resource: ['category'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['categoryGroup'],
					},
				},
				options: [
					{
						name: 'Get All',
						value: 'getAll',
						action: 'Get all category groups',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create a category group',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a category group',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a category group',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Category Group ID',
				name: 'categoryGroupId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategoryGroups',
				},
				default: '',
				description: 'The ID of the category group to operate on.',
				displayOptions: {
					show: {
						resource: ['categoryGroup'],
						operation: ['update', 'delete'],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The name of the category group.',
				displayOptions: {
					show: {
						resource: ['categoryGroup'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['payee'],
					},
				},
				options: [
					{
						name: 'Get All',
						value: 'getAll',
						action: 'Get all payees',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create a payee',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a payee',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a payee',
					},
					{
						name: 'Merge',
						value: 'merge',
						action: 'Merge payees',
					},
					{
						name: 'Get Rules',
						value: 'getRules',
						action: 'Get payee rules',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Payee ID',
				name: 'payeeId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getPayees',
				},
				default: '',
				description: 'The ID of the payee to operate on.',
				displayOptions: {
					show: {
						resource: ['payee'],
						operation: ['update', 'delete', 'merge', 'getRules'],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The name of the payee.',
				displayOptions: {
					show: {
						resource: ['payee'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Transfer Account ID',
				name: 'transferAccountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description: 'The ID of the transfer account (only for transfer payees).',
				displayOptions: {
					show: {
						resource: ['payee'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Target Payee ID',
				name: 'targetPayeeId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getPayees',
				},
				default: '',
				description: 'The ID of the target payee to merge into.',
				displayOptions: {
					show: {
						resource: ['payee'],
						operation: ['merge'],
					},
				},
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['rule'],
					},
				},
				options: [
					{
						name: 'Get All',
						value: 'getAll',
						action: 'Get all rules',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create a rule',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a rule',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a rule',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Rule ID',
				name: 'ruleId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getRules',
				},
				default: '',
				description: 'The ID of the rule to operate on.',
				displayOptions: {
					show: {
						resource: ['rule'],
						operation: ['update', 'delete'],
					},
				},
			},
			{
				displayName: 'Stage',
				name: 'stage',
				type: 'options',
				options: [
					{
						name: 'Pre',
						value: 'pre',
					},
					{
						name: 'Post',
						value: 'post',
					},
				],
				default: 'pre',
				description: 'When the rule should be applied (null for default stage).',
				displayOptions: {
					show: {
						resource: ['rule'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Conditions',
				name: 'conditions',
				type: 'json',
				default: '[]',
				description: 'JSON array of conditions for the rule to apply.',
				displayOptions: {
					show: {
						resource: ['rule'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Actions',
				name: 'actions',
				type: 'json',
				default: '[]',
				description: 'JSON array of actions of the applied rule.',
				displayOptions: {
					show: {
						resource: ['rule'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Conditions Operator',
				name: 'conditionsOp',
				type: 'options',
				options: [
					{
						name: 'And',
						value: 'and',
					},
					{
						name: 'Or',
						value: 'or',
					},
				],
				default: 'and',
				description: 'How to combine conditions.',
				displayOptions: {
					show: {
						resource: ['rule'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['schedule'],
					},
				},
				options: [
					{
						name: 'Get All',
						value: 'getAll',
						action: 'Get all schedules',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create a schedule',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a schedule',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a schedule',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Schedule ID',
				name: 'scheduleId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getSchedules',
				},
				default: '',
				description: 'The ID of the schedule to operate on.',
				displayOptions: {
					show: {
						resource: ['schedule'],
						operation: ['update', 'delete'],
					},
				},
			},
			{
				displayName: 'Schedule Details',
				name: 'scheduleDetails',
				type: 'json',
				default: '{}',
				description: 'JSON object containing schedule details.',
				displayOptions: {
					show: {
						resource: ['schedule'],
						operation: ['create', 'update'],
					},
				},
			},
			{
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
						name: 'Get All',
						value: 'getAll',
						action: 'Get all transactions',
					},
					{
						name: 'Add',
						value: 'add',
						action: 'Add transactions',
					},
					{
						name: 'Import',
						value: 'import',
						action: 'Import transactions',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a transaction',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a transaction',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['utility'],
					},
				},
				options: [
					{
						name: 'Sync',
						value: 'sync',
						action: 'Sync data',
					},
					{
						name: 'Run Bank Sync',
						value: 'runBankSync',
						action: 'Run bank sync',
					},
					{
						name: 'Run Query',
						value: 'runQuery',
						action: 'Run a query',
					},
					{
						name: 'Get ID By Name',
						value: 'getIdByName',
						action: 'Get ID by name',
					},
				],
				default: 'sync',
			},
		],
	};

	methods = {
		listSearch: {
			searchBudget: async function (
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const auth = (await this.getCredentials('actualBudgetApi', 0)) as Credentials;
				const actual = await (this as any).initApiClient(auth);

				let budgets = actual.getBudgets();
				console.debug(filter, budgets);

				if (filter !== undefined && filter !== '') {
					budgets = budgets.filter((budget: any) =>
						budget.name.toLowerCase().includes(filter.toLowerCase()),
					);
				}

				await actual.shutdown();

				return {
					results: budgets.map((budget: any) => ({
						name: budget.name,
						value: budget.cloudFileId,
						url: '',
					})),
				};
			},
		},
	};

	private async initApiClient(auth: Credentials): Promise<any> {
		const actual = require('@actual-app/api');

		const serverUrlHash = crypto.createHash('md5').update(auth.url).digest('hex');
		const dataDir = `/tmp/actual-data-${serverUrlHash}`;

		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}

		try {
			await actual.init({
				serverURL: auth.url,
				password: auth.password,
				dataDir: dataDir,
			});
			return actual;
		} catch (error) {
			throw new Error(`Actual Budget API initialization failed: ${error.message}`);
		}
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		const action = this.getNodeParameter('operation', 0) as string;
		const auth = (await this.getCredentials('actualBudgetApi', 0)) as Credentials;
		const actual = await (this as any).initApiClient(auth);

		const budgetId = this.getNodeParameter('budgetId', 0) as string;

		await actual.downloadBudget(budgetId);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let elementData;
				switch (action) {
					case 'importTransactions':
						elementData = await handleBudgetImport(this, actual, itemIndex);
						returnData.push(elementData);
						break;
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray({ error: error.message }),
						{ itemData: { item: itemIndex } },
					);
					returnData.push(...executionData);
					continue;
				}
				await actual.shutdown();
				throw error;
			}
		}

		await actual.shutdown();
		return [this.helpers.returnJsonArray(returnData)];
	}
}

async function handleBudgetImport(
	context: IExecuteFunctions,
	actual: any,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = context.getNodeParameter('accountId', itemIndex) as string;
	const transactions = context.getNodeParameter('transactions', itemIndex);

	return actual.importTransactions(accountId, transactions) as IDataObject;
}
