import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
} from 'n8n-workflow';

import * as actual from '@actual-app/api';
import { ImportTransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models';
type ActualAPI = typeof actual;

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
		usableAsTool: undefined,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		const action = this.getNodeParameter('operation', 0) as string;
		const auth = (await this.getCredentials('actualBudgetApi', 0)) as Credentials;
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

async function initializeActualBudget(auth: Credentials): Promise<ActualAPI> {
	await actual.init({
		serverURL: auth.url,
		password: auth.password,
	});

	return actual;
}

async function handleBudgetImport(
	context: IExecuteFunctions,
	actual: ActualAPI,
	itemIndex: number,
): Promise<IDataObject> {
	const accountId = context.getNodeParameter('accountId', itemIndex) as string;
	const transactions = context.getNodeParameter('transactions', itemIndex) as unknown as ImportTransactionEntity[];

	return await actual.importTransactions(accountId, transactions) as unknown as IDataObject;
}
