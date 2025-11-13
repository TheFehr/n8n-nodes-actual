import * as crypto from 'crypto';
import * as fs from 'fs';
import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	INodePropertyOptions,
	IHookFunctions, // Added for getDataLocation
	NodeApiError,
} from 'n8n-workflow';

import * as api from '@actual-app/api';

export class ActualBudget implements INodeType {
	static async initApiClient(this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions) {
		const credentials = await this.getCredentials('actualBudgetApi');
		const { serverURL, password } = credentials as { serverURL: string; password: string };
		const dataDir = `${process.env.N8N_USER_FOLDER}/actual-data/${crypto
			.createHash('md5')
			.update(serverURL)
			.digest('hex')}`;

		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}

		try {
			await api.init({
				serverURL,
				password,
				dataDir,
			});
		} catch (e) {
			throw new NodeApiError(this.getNode(), { message: (e as Error).message });
		}
	}

	static async shutdownApiClient(this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions) {
		try {
			await api.shutdown();
		} catch (e) {
			// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
			console.error('Failed to shutdown Actual Budget API client:', e);
		}
	}

	description: INodeTypeDescription = {
		displayName: 'Actual Budget',
		name: 'actualBudget',
		icon: 'file:actualbudget.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + " " + $parameter["resource"]}}',
		description: 'Interact with your Actual Budget instance',
		defaults: {
			name: 'Actual Budget',
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
						name: 'Close',
						value: 'close',
						action: 'Close an account',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create an account',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete an account',
					},
					{
						name: 'Get Balance',
						value: 'getBalance',
						action: 'Get account balance',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many accounts',
					},
					{
						name: 'Reopen',
						value: 'reopen',
						action: 'Reopen an account',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update an account',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Account Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description: 'The ID of the account to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
				description: 'The name of the account',
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
						name: 'Cash',
						value: 'cash',
					},
					{
						name: 'Checking',
						value: 'checking',
					},
					{
						name: 'Credit Card',
						value: 'creditCard',
					},
					{
						name: 'Investment',
						value: 'investment',
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
						name: 'Other',
						value: 'other',
					},
					{
						name: 'Savings',
						value: 'savings',
					},
				],
				default: 'checking',
				description: 'The type of the account',
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
				description: 'Whether the account is off-budget',
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
				description: 'Whether the account uses FinTS',
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
				description: 'Whether the account is closed',
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
						name: 'Batch Updates',
						value: 'batchUpdates',
						action: 'Batch budget updates',
					},
					{
						name: 'Download',
						value: 'download',
						action: 'Download budget',
					},
					{
						name: 'Get Month',
						value: 'getMonth',
						action: 'Get budget month',
					},
					{
						name: 'Get Months',
						value: 'getMonths',
						action: 'Get budget months',
					},
					{
						name: 'Hold For Next Month',
						value: 'holdForNextMonth',
						action: 'Hold budget for next month',
					},
					{
						name: 'Load',
						value: 'load',
						action: 'Load budget',
					},
					{
						name: 'Reset Hold',
						value: 'resetHold',
						action: 'Reset budget hold',
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
				],
				default: 'getMonths',
			},
			{
				displayName: 'Month',
				name: 'month',
				type: 'string',
				default: '',
				description: 'The month to operate on (YYYY-MM-DD format)',
				displayOptions: {
					show: {
						resource: ['budget'],
						operation: ['getMonth', 'setAmount', 'setCarryover', 'holdForNextMonth', 'resetHold'],
					},
				},
			},
			{
				displayName: 'Category Name or ID',
				name: 'categoryId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategories',
				},
				default: '',
				description: 'The ID of the category to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
				description: 'The amount to set for the category in cents',
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
				description: 'Whether to carryover the budget',
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
				description: 'JSON array of budget updates',
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
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many categories',
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
				displayName: 'Category Name or ID',
				name: 'categoryId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategories',
				},
				default: '',
				description: 'The ID of the category to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
				description: 'The name of the category',
				displayOptions: {
					show: {
						resource: ['category'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Category Group Name or ID',
				name: 'categoryGroupId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategoryGroups',
				},
				default: '',
				description: 'The ID of the category group the category belongs to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many category groups',
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
				displayName: 'Category Group Name or ID',
				name: 'categoryGroupId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategoryGroups',
				},
				default: '',
				description: 'The ID of the category group to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
				description: 'The name of the category group',
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
						name: 'Create',
						value: 'create',
						action: 'Create a payee',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a payee',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many payees',
					},
					{
						name: 'Get Rules',
						value: 'getRules',
						action: 'Get payee rules',
					},
					{
						name: 'Merge',
						value: 'merge',
						action: 'Merge payees',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a payee',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Payee Name or ID',
				name: 'payeeId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getPayees',
				},
				default: '',
				description: 'The ID of the payee to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
				description: 'The name of the payee',
				displayOptions: {
					show: {
						resource: ['payee'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Transfer Account Name or ID',
				name: 'transferAccountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description: 'The ID of the transfer account (only for transfer payees). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						resource: ['payee'],
						operation: ['create', 'update'],
					},
				},
			},
			{
				displayName: 'Target Payee Name or ID',
				name: 'targetPayeeId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getPayees',
				},
				default: '',
				description: 'The ID of the target payee to merge into. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many rules',
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
				displayName: 'Rule Name or ID',
				name: 'ruleId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getRules',
				},
				default: '',
				description: 'The ID of the rule to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
				description: 'When the rule should be applied (null for default stage)',
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
				description: 'JSON array of conditions for the rule to apply',
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
				description: 'JSON array of actions of the applied rule',
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
				description: 'How to combine conditions',
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
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many schedules',
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
				displayName: 'Schedule Name or ID',
				name: 'scheduleId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getSchedules',
				},
				default: '',
				description: 'The ID of the schedule to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
				description: 'JSON object containing schedule details',
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
						name: 'Add',
						value: 'add',
						action: 'Add transactions',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a transaction',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many transactions',
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
				],
				default: 'getAll',
			},
			{
				displayName: 'Account Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description: 'The ID of the account to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['getAll', 'add', 'import', 'update'],
					},
				},
			},
			{
				displayName: 'Transaction ID',
				name: 'transactionId',
				type: 'string',
				default: '',
				description: 'The ID of the transaction to operate on',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['update', 'delete'],
					},
				},
			},
			{
				displayName: 'Payee Name',
				name: 'payeeName',
				type: 'string',
				default: '',
				description: 'Filter transactions by payee name',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Category Name',
				name: 'categoryName',
				type: 'string',
				default: '',
				description: 'Filter transactions by category name',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Start Date',
				name: 'startDate',
				type: 'string',
				default: '',
				description: 'Filter transactions by start date (YYYY-MM-DD)',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'End Date',
				name: 'endDate',
				type: 'string',
				default: '',
				description: 'Filter transactions by end date (YYYY-MM-DD)',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Minimum Amount',
				name: 'minAmount',
				type: 'number',
				default: 0,
				description: 'Filter transactions by minimum amount (in cents)',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Maximum Amount',
				name: 'maxAmount',
				type: 'number',
				default: 0,
				description: 'Filter transactions by maximum amount (in cents)',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Transactions',
				name: 'transactions',
				type: 'json',
				default: '[]',
				description: 'JSON array of transactions to add or import',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['add', 'import'],
					},
				},
			},
			{
				displayName: 'Payee Name or ID',
				name: 'payeeId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getPayees',
				},
				default: '',
				description: 'The ID of the payee for the transaction. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['update'],
					},
				},
			},
			{
				displayName: 'Category Name or ID',
				name: 'categoryId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCategories',
				},
				default: '',
				description: 'The ID of the category for the transaction. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['update'],
					},
				},
			},
			{
				displayName: 'Notes',
				name: 'notes',
				type: 'string',
				default: '',
				description: 'Notes for the transaction',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['update'],
					},
				},
			},
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				default: 0,
				description: 'Amount of the transaction (in cents)',
				displayOptions: {
					show: {
						resource: ['transaction'],
						operation: ['update'],
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
			{
				displayName: 'Account Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
				},
				default: '',
				description: 'The ID of the account to run bank sync for. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						resource: ['utility'],
						operation: ['runBankSync'],
					},
				},
			},
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				description: 'The query to run',
				displayOptions: {
					show: {
						resource: ['utility'],
						operation: ['runQuery'],
					},
				},
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{
						name: 'Account',
						value: 'account',
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
				],
				default: 'account',
				description: 'The type of entity to get ID for',
				displayOptions: {
					show: {
						resource: ['utility'],
						operation: ['getIdByName'],
					},
				},
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The name of the entity to get ID for',
				displayOptions: {
					show: {
						resource: ['utility'],
						operation: ['getIdByName'],
					},
				},
			},
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				await ActualBudget.initApiClient.call(this);
				try {
					const accounts = await api.getAccounts();
					          return accounts.map((account) => ({
					            name: account.name,
					            value: account.id,
					          }));
					        } catch (error) {
					          throw new NodeApiError(this.getNode(), { message: (error as Error).message });
					        } finally {					await ActualBudget.shutdownApiClient.call(this);
				}
			},
						async getCategories(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
							await ActualBudget.initApiClient.call(this);
							try {
								const categories = await api.getCategories();
								return categories.map((category) => ({
									name: category.name,
									value: category.id,
								}));
							} catch (error) {
								throw new NodeApiError(this.getNode(), { message: (error as Error).message });
							} finally {
								await ActualBudget.shutdownApiClient.call(this);
							}
						},
			async getCategoryGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				await ActualBudget.initApiClient.call(this);
				try {
					const categoryGroups = await api.getCategoryGroups();
					return categoryGroups.map((categoryGroup) => ({
						name: categoryGroup.name,
						value: categoryGroup.id,
					}));
				} catch (error) {
					throw new NodeApiError(this.getNode(), { message: (error as Error).message });
				} finally {
					await ActualBudget.shutdownApiClient.call(this);
				}
			},
			async getPayees(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				await ActualBudget.initApiClient.call(this);
				try {
					const payees = await api.getPayees();
					          return payees.map((payee) => ({
					            name: payee.name,
					            value: payee.id,
					          }));
					        } catch (error) {
					          throw new NodeApiError(this.getNode(), { message: (error as Error).message });
					        } finally {					await ActualBudget.shutdownApiClient.call(this);
				}
			},
			async getRules(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				await ActualBudget.initApiClient.call(this);
				try {
					const rules = await api.getRules();
					                    return rules.map((rule) => ({
					                        name: rule.id, // Rules don't have a name, using ID for now
					                        value: rule.id,
					                    }));
					                } catch (error) {
					                    throw new NodeApiError(this.getNode(), { message: (error as Error).message });
					                } finally {					await ActualBudget.shutdownApiClient.call(this);
				}
			},
			async getSchedules(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				await ActualBudget.initApiClient.call(this);
				try {
					const schedules = await api.getSchedules();
					return schedules.map((schedule) => ({
						name: schedule.id, // Schedules don't have a name, using ID for now
						value: schedule.id,
					}));
				} catch (error) {
					throw new NodeApiError(this.getNode(), { message: (error as Error).message });
				} finally {
					await ActualBudget.shutdownApiClient.call(this);
				}
			},
		},
	};
}
