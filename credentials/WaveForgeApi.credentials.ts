import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WaveForgeApi implements ICredentialType {
	name = 'waveForgeApi';

	displayName = 'WaveForge API';

	icon = 'file:../nodes/WaveForge/waveforge.svg' as const;

	documentationUrl = 'https://waveforge.net/developers';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				"Your WaveForge API key. Test keys (wf_test_…) don't use any videos and don't encode a real video.",
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://waveforge.net',
			url: '/api/v1/presets',
		},
	};
}
