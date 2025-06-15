import {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
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
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'actualBudget',
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
						name: 'Import Transactions',
						value: 'importTransactions',
						action: 'Import a list of transactions into your budget',
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
						operation: ['importTransactions'],
					},
				},
				required: true,
			},
			{
				displayName: 'Transactions',
				name: 'transactions',
				type: 'json',
				default: '[]',
				required: true,
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
				const auth = (await this.getCredentials('actualBudget', 0)) as Credentials;
				const actual = await initializeActualBudget(auth);

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
						description: '',
					})),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		const action = this.getNodeParameter('operation', 0) as string;
		const auth = (await this.getCredentials('actualBudget', 0)) as Credentials;
		const actual = await initializeActualBudget(auth);

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

async function initializeActualBudget(auth: Credentials): Promise<any> {
	const actual = require('@actual-app/api');

	await actual.init({
		serverURL: auth.url,
		password: auth.password,
	});

	return actual;
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
