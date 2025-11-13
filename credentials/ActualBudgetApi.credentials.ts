import {
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ActualBudgetApi implements ICredentialType {
	name = 'actualBudgetApi';
	displayName = 'Actual Budget API';
	documentationUrl = 'https://actualbudget.org/docs/api/';
	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverURL',
			type: 'string',
			default: '',
			required: true
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true
		}
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.serverURL}}',
			url: '=/account/login',
			method: 'POST',
			body: {
				loginMethod: 'password',
				password: '={{$credentials?.password}}',
			}
		}
	};
}
