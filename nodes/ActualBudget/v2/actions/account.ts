import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { getAccounts } from '@actual-app/api';

export const accountOperation: INodeProperties = {
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
			name: 'Get Many',
			value: 'getAccounts',
			action: 'Get all accounts',
		},
	],
	default: 'getAccounts',
};

export const accountFields: INodeProperties[] = [];

export async function executeAccount(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getAccounts':
			return (await getAccounts()) as unknown as IDataObject[];
		default:
			throw new NodeOperationError(context.getNode(), `Unknown account operation "${operation}"`);
	}
}
