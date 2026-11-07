import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IPollFunctions,
} from 'n8n-workflow';

export const TERMINAL_HISTORY_LIMIT = 10_000;
const KNOWN_STATUSES = new Set(['pending', 'processing', 'completed', 'failed']);

interface RenderSummary extends IDataObject {
	id: string;
	status: string;
}

export class WaveForgeTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WaveForge Trigger',
		name: 'waveForgeTrigger',
		icon: {
			light: 'file:../WaveForge/waveforge.svg',
			dark: 'file:../WaveForge/waveforge.dark.svg',
		},
		subtitle: '={{"On " + $parameter["event"]}}',
		group: ['trigger'],
		version: 1,
		description: 'Bounded, best-effort coverage of the latest 50 renders per poll',
		defaults: { name: 'WaveForge Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'waveForgeApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				default: 'completed',
				options: [
					{ name: 'Render Completed', value: 'completed' },
					{ name: 'Render Failed', value: 'failed' },
					{ name: 'Render Completed or Failed', value: 'finished' },
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const state = this.getWorkflowStaticData('node') as { seen?: string[]; primed?: boolean };
		const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'waveForgeApi', {
			method: 'GET',
			url: 'https://waveforge.net/api/v1/renders',
			qs: { limit: 50 },
			json: true,
		})) as unknown;

		if (
			!response ||
			typeof response !== 'object' ||
			!('renders' in response) ||
			!Array.isArray(response.renders) ||
			response.renders.some(
				(r: unknown) =>
					!r ||
					typeof r !== 'object' ||
					!('id' in r) ||
					typeof r.id !== 'string' ||
					!r.id.trim() ||
					!('status' in r) ||
					typeof r.status !== 'string' ||
					!KNOWN_STATUSES.has(r.status),
			)
		) {
			throw new NodeOperationError(this.getNode(), 'Malformed WaveForge render list');
		}
		const renders = response.renders as RenderSummary[];

		const wanted = event === 'finished' ? ['completed', 'failed'] : [event];
		const unique = [...new Map(renders.map((r) => [r.id, r])).values()];
		const terminal = unique.filter((r) => ['completed', 'failed'].includes(r.status));
		const matches = terminal.filter((r) => wanted.includes(r.status));
		const seen = new Set(state.seen ?? []);

		if (this.getMode() === 'manual') {
			return matches.length ? [this.helpers.returnJsonArray(matches.slice(0, 1))] : null;
		}

		const fresh = matches.filter((r) => !seen.has(r.id));
		const firstRun = !state.primed;
		state.primed = true;
		// FIFO retention: last 10,000 distinct terminal IDs, no expiry or refresh on repeats.
		for (const render of terminal) seen.add(render.id);
		state.seen = [...seen].slice(-TERMINAL_HISTORY_LIMIT);
		if (firstRun || fresh.length === 0) return null;
		return [this.helpers.returnJsonArray(fresh)];
	}
}
