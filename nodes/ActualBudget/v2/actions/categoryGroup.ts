import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import {
	createCategoryGroup,
	deleteCategoryGroup,
	getCategoryGroups,
	updateCategoryGroup,
} from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

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
			name: 'Create',
			value: 'createCategoryGroup',
			action: 'Create a category group',
		},
		{
			name: 'Delete',
			value: 'deleteCategoryGroup',
			action: 'Delete a category group',
		},
		{
			name: 'Get Many',
			value: 'getCategoryGroups',
			action: 'Get all category groups',
		},
		{
			name: 'Update',
			value: 'updateCategoryGroup',
			action: 'Update a category group',
		},
	],
	default: 'getCategoryGroups',
};

export const categoryGroupFields: INodeProperties[] = [
	resourceLocatorField({
		displayName: 'Category Group',
		name: 'categoryGroupId',
		description: 'The Category Group to operate on',
		searchListMethod: 'searchCategoryGroups',
		required: true,
		displayOptions: {
			show: {
				resource: ['categoryGroup'],
				operation: ['updateCategoryGroup', 'deleteCategoryGroup'],
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
				resource: ['categoryGroup'],
				operation: ['createCategoryGroup'],
			},
		},
	},
	{
		displayName: 'Is Income',
		name: 'is_income',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['categoryGroup'],
				operation: ['createCategoryGroup'],
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
				resource: ['categoryGroup'],
				operation: ['createCategoryGroup'],
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
				resource: ['categoryGroup'],
				operation: ['updateCategoryGroup'],
			},
		},
		options: [
			{
				displayName: 'Hidden',
				name: 'hidden',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Is Income',
				name: 'is_income',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
		],
	},
	resourceLocatorField({
		displayName: 'Transfer Category',
		name: 'transferCategoryId',
		description: 'Category to reassign this group\'s budget history to on delete, if any',
		searchListMethod: 'searchCategories',
		displayOptions: {
			show: {
				resource: ['categoryGroup'],
				operation: ['deleteCategoryGroup'],
			},
		},
	}),
];

export async function executeCategoryGroup(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getCategoryGroups':
			return (await getCategoryGroups()) as unknown as IDataObject[];
		case 'createCategoryGroup':
			return handleCreateCategoryGroup(context, itemIndex);
		case 'updateCategoryGroup':
			return handleUpdateCategoryGroup(context, itemIndex);
		case 'deleteCategoryGroup':
			return handleDeleteCategoryGroup(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown category group operation "${operation}"`);
	}
}

function getCategoryGroupId(context: IExecuteFunctions, itemIndex: number): string {
	return context.getNodeParameter('categoryGroupId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
}

async function handleCreateCategoryGroup(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const name = context.getNodeParameter('name', itemIndex) as string;
	const is_income = context.getNodeParameter('is_income', itemIndex) as boolean;
	const hidden = context.getNodeParameter('hidden', itemIndex) as boolean;
	const id = await createCategoryGroup({ name, is_income, hidden });
	return { id, name, is_income, hidden };
}

async function handleUpdateCategoryGroup(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getCategoryGroupId(context, itemIndex);
	const fields = context.getNodeParameter('updateFields', itemIndex) as IDataObject;
	await updateCategoryGroup(id, fields);
	return { success: true, id, ...fields };
}

async function handleDeleteCategoryGroup(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getCategoryGroupId(context, itemIndex);
	const transferCategoryId = context.getNodeParameter('transferCategoryId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	await deleteCategoryGroup(id, transferCategoryId || undefined);
	return { success: true, id };
}
