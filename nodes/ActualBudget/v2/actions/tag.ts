import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { createTag, deleteTag, getTags, updateTag } from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

export const tagOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['tag'],
		},
	},
	options: [
		{
			name: 'Create',
			value: 'createTag',
			action: 'Create a tag',
		},
		{
			name: 'Delete',
			value: 'deleteTag',
			action: 'Delete a tag',
		},
		{
			name: 'Get Many',
			value: 'getTags',
			action: 'Get all tags',
		},
		{
			name: 'Update',
			value: 'updateTag',
			action: 'Update a tag',
		},
	],
	default: 'getTags',
};

export const tagFields: INodeProperties[] = [
	resourceLocatorField({
		displayName: 'Tag',
		name: 'tagId',
		description: 'The Tag to operate on',
		searchListMethod: 'searchTags',
		required: true,
		displayOptions: {
			show: {
				resource: ['tag'],
				operation: ['updateTag', 'deleteTag'],
			},
		},
	}),
	{
		displayName: 'Tag',
		name: 'tag',
		type: 'string',
		default: '',
		required: true,
		description: 'The tag text, e.g. "#reimbursable"',
		displayOptions: {
			show: {
				resource: ['tag'],
				operation: ['createTag'],
			},
		},
	},
	{
		displayName: 'Color',
		name: 'color',
		type: 'color',
		default: '',
		displayOptions: {
			show: {
				resource: ['tag'],
				operation: ['createTag'],
			},
		},
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['tag'],
				operation: ['createTag'],
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
				resource: ['tag'],
				operation: ['updateTag'],
			},
		},
		options: [
			{
				displayName: 'Color',
				name: 'color',
				type: 'color',
				default: '',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Tag',
				name: 'tag',
				type: 'string',
				default: '',
			},
		],
	},
];

export async function executeTag(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getTags':
			return (await getTags()) as unknown as IDataObject[];
		case 'createTag':
			return handleCreateTag(context, itemIndex);
		case 'updateTag':
			return handleUpdateTag(context, itemIndex);
		case 'deleteTag':
			return handleDeleteTag(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown tag operation "${operation}"`);
	}
}

function getTagId(context: IExecuteFunctions, itemIndex: number): string {
	return context.getNodeParameter('tagId', itemIndex, undefined, { extractValue: true }) as string;
}

async function handleCreateTag(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const tag = context.getNodeParameter('tag', itemIndex) as string;
	const color = context.getNodeParameter('color', itemIndex) as string;
	const description = context.getNodeParameter('description', itemIndex) as string;
	const id = await createTag({ tag, color, description });
	return { id, tag, color, description };
}

async function handleUpdateTag(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getTagId(context, itemIndex);
	const fields = context.getNodeParameter('updateFields', itemIndex) as IDataObject;
	await updateTag(id, fields);
	return { success: true, id, ...fields };
}

async function handleDeleteTag(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getTagId(context, itemIndex);
	await deleteTag(id);
	return { success: true, id };
}
