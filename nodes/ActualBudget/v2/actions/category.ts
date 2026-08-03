import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { createCategory, deleteCategory, getCategories, updateCategory } from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

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
			name: 'Create',
			value: 'createCategory',
			action: 'Create a category',
		},
		{
			name: 'Delete',
			value: 'deleteCategory',
			action: 'Delete a category',
		},
		{
			name: 'Get Many',
			value: 'getCategories',
			action: 'Get all categories',
		},
		{
			name: 'Update',
			value: 'updateCategory',
			action: 'Update a category',
		},
	],
	default: 'getCategories',
};

export const categoryFields: INodeProperties[] = [
	resourceLocatorField({
		displayName: 'Category',
		name: 'categoryId',
		description: 'The Category to operate on',
		searchListMethod: 'searchCategories',
		required: true,
		displayOptions: {
			show: {
				resource: ['category'],
				operation: ['updateCategory', 'deleteCategory'],
			},
		},
	}),
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['category'],
				operation: ['createCategory'],
			},
		},
	},
	resourceLocatorField({
		displayName: 'Category Group',
		name: 'groupId',
		description: 'The Category Group this category belongs to',
		searchListMethod: 'searchCategoryGroups',
		required: true,
		displayOptions: {
			show: {
				resource: ['category'],
				operation: ['createCategory'],
			},
		},
	}),
	{
		displayName: 'Is Income',
		name: 'is_income',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['category'],
				operation: ['createCategory'],
			},
		},
	},
	{
		displayName: 'Hidden',
		name: 'hidden',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['category'],
				operation: ['createCategory'],
			},
		},
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['category'],
				operation: ['updateCategory'],
			},
		},
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Is Income',
				name: 'is_income',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Hidden',
				name: 'hidden',
				type: 'boolean',
				default: false,
			},
		],
	},
	resourceLocatorField({
		displayName: 'Transfer Category',
		name: 'transferCategoryId',
		description: 'Category to reassign this category\'s budget history to on delete, if any',
		searchListMethod: 'searchCategories',
		displayOptions: {
			show: {
				resource: ['category'],
				operation: ['deleteCategory'],
			},
		},
	}),
];

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
		case 'createCategory':
			return handleCreateCategory(context, itemIndex);
		case 'updateCategory':
			return handleUpdateCategory(context, itemIndex);
		case 'deleteCategory':
			return handleDeleteCategory(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown category operation "${operation}"`);
	}
}

function getCategoryId(context: IExecuteFunctions, itemIndex: number): string {
	return context.getNodeParameter('categoryId', itemIndex, undefined, { extractValue: true }) as string;
}

async function handleCreateCategory(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const name = context.getNodeParameter('name', itemIndex) as string;
	const groupId = context.getNodeParameter('groupId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const is_income = context.getNodeParameter('is_income', itemIndex) as boolean;
	const hidden = context.getNodeParameter('hidden', itemIndex) as boolean;
	const id = await createCategory({ name, group_id: groupId, is_income, hidden });
	return { id, name, group_id: groupId, is_income, hidden };
}

async function handleUpdateCategory(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getCategoryId(context, itemIndex);
	const fields = context.getNodeParameter('updateFields', itemIndex) as IDataObject;
	await updateCategory(id, fields);
	return { success: true, id, ...fields };
}

async function handleDeleteCategory(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getCategoryId(context, itemIndex);
	const transferCategoryId = context.getNodeParameter('transferCategoryId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	await deleteCategory(id, transferCategoryId || undefined);
	return { success: true, id };
}
