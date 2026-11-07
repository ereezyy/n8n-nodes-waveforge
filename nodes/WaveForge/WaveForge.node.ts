import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { renderDescription } from './resources/render';
import { presetDescription } from './resources/preset';

export class WaveForge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WaveForge',
		name: 'waveForge',
		icon: { light: 'file:waveforge.svg', dark: 'file:waveforge.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create music-video renders with the WaveForge API',
		defaults: { name: 'WaveForge' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'waveForgeApi', required: true }],
		requestDefaults: {
			baseURL: 'https://waveforge.net',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Render', value: 'render' },
					{ name: 'Preset', value: 'preset' },
				],
				default: 'render',
			},
			...renderDescription,
			...presetDescription,
		],
	};
}
