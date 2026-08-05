import { INodeTypeBaseDescription, IVersionedNodeType, VersionedNodeType } from 'n8n-workflow';

import { ActualBudgetV1 } from './v1/ActualBudgetV1.node';
import { ActualBudgetV2 } from './v2/ActualBudgetV2.node';

// Existing saved workflow nodes have typeVersion 1 (no "resource" parameter stored) and
// must keep resolving to ActualBudgetV1's flat operation dropdown. New nodes default to
// V2's resource+operation structure. See v1/ActualBudgetV1.node.ts for why V1 must stay frozen.
export class ActualBudget extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'ActualBudget',
			name: 'actualBudget',
			icon: 'file:actualbudget.svg',
			group: ['transform'],
			description: 'Consume ActualBudget API',
			defaultVersion: 2,
		};

		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new ActualBudgetV1(),
			2: new ActualBudgetV2(),
		};

		super(nodeVersions, baseDescription);
	}
}
