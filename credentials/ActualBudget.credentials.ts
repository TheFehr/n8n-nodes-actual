import {
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ActualBudget implements ICredentialType {
	name = 'actualBudget';
	displayName = 'Actual Budget';
	documentationUrl = 'https://actualbudget.org/docs/api/';
	properties: INodeProperties[] = [
		{
			displayName: 'URL',
			name: 'url',
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
			baseURL: '={{$credentials?.url}}',
			url: '=/account/login',
			method: 'POST',
			body: {
				loginMethod: 'password',
				password: '={{$credentials?.password}}',
			}
		}
	};
}
