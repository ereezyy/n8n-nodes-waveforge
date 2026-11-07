import type { INodeProperties } from 'n8n-workflow';

const showOnlyForPresets = { resource: ['preset'] };

export const presetDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForPresets },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many presets',
				description: 'List visualizer presets',
				routing: {
					request: { method: 'GET', url: '/api/v1/presets' },
					output: { postReceive: [{ type: 'rootProperty', properties: { property: 'presets' } }] },
				},
			},
		],
		default: 'getAll',
	},
];
