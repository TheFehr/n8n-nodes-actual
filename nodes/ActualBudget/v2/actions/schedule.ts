import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { createSchedule, deleteSchedule, getSchedules, updateSchedule } from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

export const scheduleOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['schedule'],
		},
	},
	options: [
		{
			name: 'Create',
			value: 'createSchedule',
			action: 'Create a schedule',
		},
		{
			name: 'Delete',
			value: 'deleteSchedule',
			action: 'Delete a schedule',
		},
		{
			name: 'Get Many',
			value: 'getSchedules',
			action: 'Get all schedules',
		},
		{
			name: 'Update',
			value: 'updateSchedule',
			action: 'Update a schedule',
		},
	],
	default: 'getSchedules',
};

const amountOpOptions = [
	{ name: 'Is', value: 'is' },
	{ name: 'Is Approximately', value: 'isapprox' },
	{ name: 'Is Between', value: 'isbetween' },
];

export const scheduleFields: INodeProperties[] = [
	{
		displayName: 'Schedule ID',
		name: 'scheduleId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the schedule (see the Schedule "Get Many" operation to look it up)',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['updateSchedule', 'deleteSchedule'],
			},
		},
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
			},
		},
	},
	resourceLocatorField({
		displayName: 'Account',
		name: 'accountId',
		description: 'The Account this schedule applies to',
		searchListMethod: 'searchAccounts',
		required: true,
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
			},
		},
	}),
	resourceLocatorField({
		displayName: 'Payee',
		name: 'payeeId',
		description: 'The Payee this schedule applies to',
		searchListMethod: 'searchPayees',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
			},
		},
	}),
	{
		displayName: 'Amount Operator',
		name: 'amountOp',
		type: 'options',
		options: amountOpOptions,
		default: 'is',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
			},
		},
	},
	{
		displayName: 'Amount',
		name: 'amount',
		type: 'number',
		default: 0,
		description: 'Amount in cents',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
				amountOp: ['is', 'isapprox'],
			},
		},
	},
	{
		displayName: 'Amount Lower',
		name: 'amountLower',
		type: 'number',
		default: 0,
		description: 'Lower bound of the amount range, in cents',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
				amountOp: ['isbetween'],
			},
		},
	},
	{
		displayName: 'Amount Upper',
		name: 'amountUpper',
		type: 'number',
		default: 0,
		description: 'Upper bound of the amount range, in cents',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
				amountOp: ['isbetween'],
			},
		},
	},
	{
		displayName: 'Date',
		name: 'date',
		type: 'json',
		default: '""',
		required: true,
		description:
			'A date string (YYYY-MM-DD) for a one-off schedule, or a recurring-date config object per the Actual API docs',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
			},
		},
	},
	{
		displayName: 'Posts Transaction',
		name: 'posts_transaction',
		type: 'boolean',
		default: false,
		description: 'Whether Actual should automatically post a transaction when this schedule is due',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['createSchedule'],
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
				resource: ['schedule'],
				operation: ['updateSchedule'],
			},
		},
		options: [
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						amountOp: ['is', 'isapprox'],
					},
				},
			},
			{
				displayName: 'Amount Lower',
				name: 'amountLower',
				type: 'number',
				default: 0,
				description: 'Lower bound of the amount range, in cents',
				displayOptions: {
					show: {
						amountOp: ['isbetween'],
					},
				},
			},
			{
				displayName: 'Amount Operator',
				name: 'amountOp',
				type: 'options',
				options: amountOpOptions,
				default: 'is',
			},
			{
				displayName: 'Amount Upper',
				name: 'amountUpper',
				type: 'number',
				default: 0,
				description: 'Upper bound of the amount range, in cents',
				displayOptions: {
					show: {
						amountOp: ['isbetween'],
					},
				},
			},
			{
				displayName: 'Date',
				name: 'date',
				type: 'json',
				default: '""',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Posts Transaction',
				name: 'posts_transaction',
				type: 'boolean',
				default: false,
			},
		],
	},
	{
		displayName: 'Reset Next Date',
		name: 'resetNextDate',
		type: 'boolean',
		default: false,
		description: 'Whether to recompute the next occurrence date from today rather than the schedule\'s prior state',
		displayOptions: {
			show: {
				resource: ['schedule'],
				operation: ['updateSchedule'],
			},
		},
	},
];

export async function executeSchedule(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getSchedules':
			return (await getSchedules()) as unknown as IDataObject[];
		case 'createSchedule':
			return handleCreateSchedule(context, itemIndex);
		case 'updateSchedule':
			return handleUpdateSchedule(context, itemIndex);
		case 'deleteSchedule':
			return handleDeleteSchedule(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown schedule operation "${operation}"`);
	}
}

function parseDateField(raw: unknown): unknown {
	if (typeof raw !== 'string') return raw;
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function isEmptyDate(date: unknown): boolean {
	return date === null || date === undefined || date === '';
}

function resolveAmount(
	context: IExecuteFunctions,
	amountOp: string,
	amount: number,
	amountLower: number,
	amountUpper: number,
): number | { num1: number; num2: number } {
	if (amountOp !== 'isbetween') return amount;
	if (amountLower > amountUpper) {
		throw new NodeOperationError(context.getNode(), '"Amount Lower" must be less than or equal to "Amount Upper"');
	}
	return { num1: amountLower, num2: amountUpper };
}

async function handleCreateSchedule(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const name = context.getNodeParameter('name', itemIndex) as string;
	const accountId = context.getNodeParameter('accountId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const payeeId = context.getNodeParameter('payeeId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const amountOp = context.getNodeParameter('amountOp', itemIndex) as 'is' | 'isapprox' | 'isbetween';
	const amount = resolveAmount(
		context,
		amountOp,
		context.getNodeParameter('amount', itemIndex) as number,
		context.getNodeParameter('amountLower', itemIndex) as number,
		context.getNodeParameter('amountUpper', itemIndex) as number,
	);
	const date = parseDateField(context.getNodeParameter('date', itemIndex));
	if (isEmptyDate(date)) {
		throw new NodeOperationError(context.getNode(), '"date" must not be empty');
	}
	const posts_transaction = context.getNodeParameter('posts_transaction', itemIndex) as boolean;

	const id = await createSchedule({
		name,
		account: accountId,
		payee: payeeId || undefined,
		amount,
		amountOp,
		date,
		posts_transaction,
	} as never);
	return { id, name };
}

async function handleUpdateSchedule(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = context.getNodeParameter('scheduleId', itemIndex) as string;
	const fields = context.getNodeParameter('updateFields', itemIndex) as IDataObject;

	// amountLower/amountUpper are UI-only helper params for the "Is Between" range value,
	// not real APIScheduleEntity fields - fold them into "amount" and strip them before
	// sending, same shape as createSchedule's resolveAmount().
	const amountLower = fields.amountLower as number | undefined;
	const amountUpper = fields.amountUpper as number | undefined;
	delete fields.amountLower;
	delete fields.amountUpper;
	if (fields.amountOp === 'isbetween') {
		if (typeof amountLower !== 'number' || typeof amountUpper !== 'number') {
			throw new NodeOperationError(
				context.getNode(),
				'When "Amount Operator" is "Is Between", both "Amount Lower" and "Amount Upper" must be set',
			);
		}
		if (amountLower > amountUpper) {
			throw new NodeOperationError(context.getNode(), '"Amount Lower" must be less than or equal to "Amount Upper"');
		}
		fields.amount = { num1: amountLower, num2: amountUpper };
	}

	if (typeof fields.date !== 'undefined') {
		const parsedDate = parseDateField(fields.date);
		if (isEmptyDate(parsedDate)) {
			throw new NodeOperationError(context.getNode(), '"date" must not be empty');
		}
		fields.date = parsedDate as IDataObject['date'];
	}
	const resetNextDate = context.getNodeParameter('resetNextDate', itemIndex) as boolean;
	await updateSchedule(id, fields, resetNextDate);
	return { success: true, id, ...fields };
}

async function handleDeleteSchedule(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = context.getNodeParameter('scheduleId', itemIndex) as string;
	await deleteSchedule(id);
	return { success: true, id };
}
