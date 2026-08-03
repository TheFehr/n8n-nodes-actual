import { IDataObject, IExecuteFunctions, INodeProperties, NodeOperationError } from 'n8n-workflow';

import { createRule, deleteRule, getPayeeRules, getRules, updateRule } from '@actual-app/api';

import { resourceLocatorField } from '../GenericFunctions';

export const ruleOperation: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: ['rule'],
		},
	},
	options: [
		{
			name: 'Create',
			value: 'createRule',
			action: 'Create a rule',
		},
		{
			name: 'Delete',
			value: 'deleteRule',
			action: 'Delete a rule',
		},
		{
			name: 'Get for Payee',
			value: 'getPayeeRules',
			action: 'Get rules for a specific payee',
		},
		{
			name: 'Get Many',
			value: 'getRules',
			action: 'Get all rules',
		},
		{
			name: 'Update',
			value: 'updateRule',
			action: 'Update a rule',
		},
	],
	default: 'getRules',
};

const ruleJsonField = (name: string, displayOptions: string[]): INodeProperties => ({
	displayName: 'Rule',
	name,
	type: 'json',
	default: '{\n  "stage": null,\n  "conditionsOp": "and",\n  "conditions": [],\n  "actions": []\n}',
	required: true,
	description:
		'The rule body, matching the Actual rule schema: { stage, conditionsOp, conditions, actions }. See https://actualbudget.org/docs/api/reference/#rule for the condition/action shapes.',
	displayOptions: {
		show: {
			resource: ['rule'],
			operation: displayOptions,
		},
	},
});

export const ruleFields: INodeProperties[] = [
	resourceLocatorField({
		displayName: 'Payee',
		name: 'payeeId',
		description: 'The Payee to get rules for',
		searchListMethod: 'searchPayees',
		required: true,
		displayOptions: {
			show: {
				resource: ['rule'],
				operation: ['getPayeeRules'],
			},
		},
	}),
	{
		displayName: 'Rule ID',
		name: 'ruleId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the rule (see the Rule "Get Many" operation to look it up)',
		displayOptions: {
			show: {
				resource: ['rule'],
				operation: ['updateRule', 'deleteRule'],
			},
		},
	},
	ruleJsonField('rule', ['createRule', 'updateRule']),
];

export async function executeRule(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getRules':
			return (await getRules()) as unknown as IDataObject[];
		case 'getPayeeRules':
			return handleGetPayeeRules(context, itemIndex);
		case 'createRule':
			return handleCreateRule(context, itemIndex);
		case 'updateRule':
			return handleUpdateRule(context, itemIndex);
		case 'deleteRule':
			return handleDeleteRule(context, itemIndex);
		default:
			throw new NodeOperationError(context.getNode(), `Unknown rule operation "${operation}"`);
	}
}

function parseRuleJson(context: IExecuteFunctions, itemIndex: number): IDataObject {
	const raw = context.getNodeParameter('rule', itemIndex);
	let parsed: unknown;
	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new NodeOperationError(context.getNode(), 'Rule field contains invalid JSON');
		}
	} else {
		parsed = raw;
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new NodeOperationError(context.getNode(), '"rule" must be a JSON object');
	}
	return parsed as IDataObject;
}

async function handleGetPayeeRules(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const payeeId = context.getNodeParameter('payeeId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	return (await getPayeeRules(payeeId)) as unknown as IDataObject[];
}

async function handleCreateRule(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const rule = parseRuleJson(context, itemIndex);
	return (await createRule(rule as never)) as unknown as IDataObject;
}

async function handleUpdateRule(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = context.getNodeParameter('ruleId', itemIndex) as string;
	const rule = parseRuleJson(context, itemIndex);
	return (await updateRule({ id, ...rule } as never)) as unknown as IDataObject;
}

async function handleDeleteRule(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = context.getNodeParameter('ruleId', itemIndex) as string;
	const success = await deleteRule(id);
	return { success, id };
}
