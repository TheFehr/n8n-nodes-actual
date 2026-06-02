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
	shutdown,
} from '@actual-app/api';

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
		await initializeActualBudget(auth);

		const budgetId = this.getNodeParameter('budgetId', 0) as string;

		await downloadBudget(budgetId);

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let elementData;
				switch (action) {
					case 'importTransactions':
						elementData = await handleBudgetImport(this, itemIndex);
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
				await shutdown();
				throw error;
			}
		}

		await shutdown();
		return [this.helpers.returnJsonArray(returnData)];
	}
}

async function initializeActualBudget(auth: Credentials): Promise<void> {
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
