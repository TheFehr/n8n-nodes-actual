import { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { runExclusive } from '../executionQueue';
import { ActualBudgetV2, runActualBudget } from '../v2/ActualBudgetV2.node';
import { Credentials, requireCredentialBudgetId } from '../v2/GenericFunctions';
import { listSearchV3 } from '../v2/methods/listSearch';

/**
 * Node version 3: identical to version 2 (same resources, operations and fields) except that
 * the budget is not a node parameter. It comes from the Actual Budget API credential, together
 * with that budget's end-to-end encryption password, so each credential describes one budget
 * and budgets with different encryption passwords live side by side.
 *
 * Versions 1 and 2 stay frozen with their node-level Budget ID so saved workflows keep working.
 */
const v2Description = new ActualBudgetV2().description;

export class ActualBudgetV3 implements INodeType {
	description: INodeTypeDescription = {
		...v2Description,
		// Declared explicitly (rather than only inherited from V2) so they are statically visible.
		// Same icon path as V2 - see the comment there for why it is relative to the wrapper.
		// eslint-disable-next-line @n8n/community-nodes/icon-validation -- path is correct at runtime, see V2
		icon: 'file:actualbudget.svg',
		subtitle: '={{$parameter["operation"] + " " + $parameter["resource"]}}',
		usableAsTool: undefined,
		version: 3,
		properties: v2Description.properties.filter((property) => property.name !== 'budgetId'),
	};

	methods = {
		listSearch: listSearchV3,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const continueOnFail = this.continueOnFail();
		// Fail fast on a credential without a Budget ID, before touching the network or the
		// shared (serialized) Actual session.
		const auth = (await this.getCredentials('actualBudgetApi', 0)) as Credentials;
		const budgetId = requireCredentialBudgetId(this, auth);
		// Same shared queue as V1/V2: @actual-app/api's session is a process-wide singleton.
		return runExclusive(() => runActualBudget(this, continueOnFail, () => budgetId));
	}
}
