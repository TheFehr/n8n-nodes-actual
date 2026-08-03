import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { getPayees } from '@actual-app/api';

export const payeeOperation: INodeProperties = {
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
			name: 'Get Many',
			value: 'getPayees',
			action: 'Get all payees',
		},
	],
	default: 'getPayees',
};

export const payeeFields: INodeProperties[] = [];

export async function executePayee(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getPayees':
			return (await getPayees()) as unknown as IDataObject[];
		default:
			throw new NodeOperationError(context.getNode(), `Unknown payee operation "${operation}"`);
	}
}
