import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { getCategoryGroups } from '@actual-app/api';

export const categoryGroupOperation: INodeProperties = {
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
			value: 'getCategoryGroups',
			action: 'Get all category groups',
		},
	],
	default: 'getCategoryGroups',
};

export const categoryGroupFields: INodeProperties[] = [];

export async function executeCategoryGroup(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getCategoryGroups':
			return (await getCategoryGroups()) as unknown as IDataObject[];
		default:
			throw new NodeOperationError(context.getNode(), `Unknown category group operation "${operation}"`);
	}
}
