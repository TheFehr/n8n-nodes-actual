import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { aqlQuery, q } from '@actual-app/api';

export const queryOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['query'],
		},
	},
	options: [
		{
			name: 'Run',
			value: 'runQuery',
			action: 'Run a custom AQL query',
		},
	],
	default: 'runQuery',
};

export const queryFields: INodeProperties[] = [
	{
		displayName: 'Table',
		name: 'table',
		type: 'string',
		default: 'transactions',
		required: true,
		description: 'The table to query, e.g. "transactions", "accounts", "categories", "payees"',
		displayOptions: {
			show: {
				resource: ['query'],
				operation: ['runQuery'],
			},
		},
	},
	{
		displayName: 'Filter',
		name: 'filter',
		type: 'json',
		default: '{}',
		description: 'AQL filter expression object, e.g. {"date": {"$gte": "2024-01-01"}}',
		displayOptions: {
			show: {
				resource: ['query'],
				operation: ['runQuery'],
			},
		},
	},
	{
		displayName: 'Select',
		name: 'select',
		type: 'json',
		default: '"*"',
		description: 'Fields to select: "*", a field name, or a JSON array of fields/expressions',
		displayOptions: {
			show: {
				resource: ['query'],
				operation: ['runQuery'],
			},
		},
	},
	{
		displayName: 'Group By',
		name: 'groupBy',
		type: 'json',
		default: '[]',
		description: 'JSON array of fields/expressions to group by, if any',
		displayOptions: {
			show: {
				resource: ['query'],
				operation: ['runQuery'],
			},
		},
	},
	{
		displayName: 'Order By',
		name: 'orderBy',
		type: 'json',
		default: '[]',
		description: 'JSON array of fields/expressions to order by, if any',
		displayOptions: {
			show: {
				resource: ['query'],
				operation: ['runQuery'],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'rowLimit',
		type: 'number',
		default: 0,
		description: 'Max number of rows to return (0 = no limit)',
		displayOptions: {
			show: {
				resource: ['query'],
				operation: ['runQuery'],
			},
		},
	},
	{
		displayName: 'Offset',
		name: 'offset',
		type: 'number',
		default: 0,
		description: 'Number of rows to skip (0 = none)',
		displayOptions: {
			show: {
				resource: ['query'],
				operation: ['runQuery'],
			},
		},
	},
];

function parseJsonParam(context: IExecuteFunctions, name: string, itemIndex: number): unknown {
	const raw = context.getNodeParameter(name, itemIndex);
	if (typeof raw !== 'string') return raw;
	try {
		return JSON.parse(raw);
	} catch {
		throw new NodeOperationError(context.getNode(), `"${name}" field contains invalid JSON`);
	}
}

export async function executeQuery(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'runQuery':
			return handleRunQuery(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown query operation "${operation}"`);
	}
}

async function handleRunQuery(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const table = context.getNodeParameter('table', itemIndex) as string;
	const filter = parseJsonParam(context, 'filter', itemIndex) as Record<string, unknown>;
	const select = parseJsonParam(context, 'select', itemIndex) as string | unknown[];
	const groupBy = parseJsonParam(context, 'groupBy', itemIndex) as unknown[];
	const orderBy = parseJsonParam(context, 'orderBy', itemIndex) as unknown[];
	const limit = context.getNodeParameter('rowLimit', itemIndex) as number;
	const offset = context.getNodeParameter('offset', itemIndex) as number;

	let query = q(table);
	if (filter && Object.keys(filter).length > 0) {
		query = query.filter(filter);
	}
	if (Array.isArray(select) ? select.length > 0 : Boolean(select)) {
		query = query.select(select as never);
	}
	if (Array.isArray(groupBy) && groupBy.length > 0) {
		query = query.groupBy(groupBy as never);
	}
	if (Array.isArray(orderBy) && orderBy.length > 0) {
		query = query.orderBy(orderBy as never);
	}
	if (limit > 0) {
		query = query.limit(limit);
	}
	if (offset > 0) {
		query = query.offset(offset);
	}

	const { data } = (await aqlQuery(query)) as { data: IDataObject[] };
	return data;
}
