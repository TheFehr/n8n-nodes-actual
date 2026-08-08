import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { getNote, updateNote } from '@actual-app/api';

export const noteOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['note'],
		},
	},
	options: [
		{
			name: 'Get',
			value: 'getNote',
			action: 'Get the note attached to an entity',
		},
		{
			name: 'Update',
			value: 'updateNote',
			action: 'Set the note attached to an entity',
		},
	],
	default: 'getNote',
};

export const noteFields: INodeProperties[] = [
	{
		displayName: 'Entity ID',
		name: 'entityId',
		type: 'string',
		default: '',
		required: true,
		description:
			'The ID of the entity the note is attached to (e.g. an account, category, or transaction ID)',
		displayOptions: {
			show: {
				resource: ['note'],
				operation: ['getNote', 'updateNote'],
			},
		},
	},
	{
		displayName: 'Note',
		name: 'note',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: '',
		description: 'The note text. Leave empty to clear the note.',
		displayOptions: {
			show: {
				resource: ['note'],
				operation: ['updateNote'],
			},
		},
	},
];

export async function executeNote(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getNote':
			return handleGetNote(context, itemIndex);
		case 'updateNote':
			return handleUpdateNote(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown note operation "${operation}"`);
	}
}

async function handleGetNote(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const entityId = context.getNodeParameter('entityId', itemIndex) as string;
	const result = await getNote(entityId);
	return (result ?? { id: entityId, note: null }) as unknown as IDataObject;
}

async function handleUpdateNote(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const entityId = context.getNodeParameter('entityId', itemIndex) as string;
	const note = context.getNodeParameter('note', itemIndex) as string;
	await updateNote(entityId, note);
	return { success: true, id: entityId, note };
}
