import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { getCategories } from '@actual-app/api';

export const categoryOperation: INodeProperties = {
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
			value: 'getCategories',
			action: 'Get all categories',
		},
	],
	default: 'getCategories',
};

export const categoryFields: INodeProperties[] = [];

export async function executeCategory(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getCategories':
			// Note: getCategories() can return a mix of category and category-group
			// entities in one flat array depending on the budget's structure. Use the
			// "Category Group" resource's Get Many if you need the clean nested shape.
			return (await getCategories()) as unknown as IDataObject[];
		default:
			throw new NodeOperationError(context.getNode(), `Unknown category operation "${operation}"`);
	}
}
