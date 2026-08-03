import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import {
	createPayee,
	deletePayee,
	getCommonPayees,
	getPayees,
	mergePayees,
	updatePayee,
} from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

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
			name: 'Create',
			value: 'createPayee',
			action: 'Create a payee',
		},
		{
			name: 'Delete',
			value: 'deletePayee',
			action: 'Delete a payee',
		},
		{
			name: 'Get Common',
			value: 'getCommonPayees',
			action: 'Get frequently used payees',
		},
		{
			name: 'Get Many',
			value: 'getPayees',
			action: 'Get all payees',
		},
		{
			name: 'Merge',
			value: 'mergePayees',
			action: 'Merge duplicate payees into one',
		},
		{
			name: 'Update',
			value: 'updatePayee',
			action: 'Update a payee',
		},
	],
	default: 'getPayees',
};

export const payeeFields: INodeProperties[] = [
	resourceLocatorField({
		displayName: 'Payee',
		name: 'payeeId',
		description: 'The Payee to operate on',
		searchListMethod: 'searchPayees',
		required: true,
		displayOptions: {
			show: {
				resource: ['payee'],
				operation: ['updatePayee', 'deletePayee'],
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
				resource: ['payee'],
				operation: ['createPayee'],
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
				resource: ['payee'],
				operation: ['updatePayee'],
			},
		},
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
		],
	},
	resourceLocatorField({
		displayName: 'Target Payee',
		name: 'targetPayeeId',
		description: 'The Payee that the other payees below will be merged into',
		searchListMethod: 'searchPayees',
		required: true,
		displayOptions: {
			show: {
				resource: ['payee'],
				operation: ['mergePayees'],
			},
		},
	}),
	{
		displayName: 'Payee IDs to Merge',
		name: 'mergeIds',
		type: 'string',
		default: [],
		required: true,
		description: 'IDs of the duplicate payees to merge into the target payee above (see the Payee "Get Many" operation to look them up)',
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: ['payee'],
				operation: ['mergePayees'],
			},
		},
	},
];

export async function executePayee(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getPayees':
			return (await getPayees()) as unknown as IDataObject[];
		case 'getCommonPayees':
			return (await getCommonPayees()) as unknown as IDataObject[];
		case 'createPayee':
			return handleCreatePayee(context, itemIndex);
		case 'updatePayee':
			return handleUpdatePayee(context, itemIndex);
		case 'deletePayee':
			return handleDeletePayee(context, itemIndex);
		case 'mergePayees':
			return handleMergePayees(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown payee operation "${operation}"`);
	}
}

function getPayeeId(context: IExecuteFunctions, itemIndex: number): string {
	return context.getNodeParameter('payeeId', itemIndex, undefined, { extractValue: true }) as string;
}

async function handleCreatePayee(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const name = context.getNodeParameter('name', itemIndex) as string;
	const id = await createPayee({ name });
	return { id, name };
}

async function handleUpdatePayee(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getPayeeId(context, itemIndex);
	const fields = context.getNodeParameter('updateFields', itemIndex) as IDataObject;
	await updatePayee(id, fields);
	return { success: true, id, ...fields };
}

async function handleDeletePayee(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = getPayeeId(context, itemIndex);
	await deletePayee(id);
	return { success: true, id };
}

async function handleMergePayees(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const targetId = context.getNodeParameter('targetPayeeId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const mergeIds = context.getNodeParameter('mergeIds', itemIndex) as string[];
	await mergePayees(targetId, mergeIds);
	return { success: true, targetId, mergedIds: mergeIds };
}
