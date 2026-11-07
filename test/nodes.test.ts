/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles for n8n contexts */
import { describe, expect, it, vi } from 'vitest';
import type { INodeProperties } from 'n8n-workflow';
import { WaveForge } from '../nodes/WaveForge/WaveForge.node';
import { WaveForgeTrigger } from '../nodes/WaveForgeTrigger/WaveForgeTrigger.node';
import { WaveForgeApi } from '../credentials/WaveForgeApi.credentials';
import pkg from '../package.json';

// Routes confirmed in WaveForge openapi/v1.yaml (live https://waveforge.net/api/v1/openapi.yaml).
const CONFIRMED = new Set([
	'GET /api/v1/presets',
	'GET /api/v1/renders',
	'POST /api/v1/renders',
	'GET /api/v1/renders/{id}',
	'GET /api/v1/renders/{id}/output',
]);

const node = new WaveForge();
const ops = (resource: string) =>
	(
		node.description.properties.find(
			(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
		) as INodeProperties
	).options as Array<{ value: string; routing: { request: { method: string; url: string } } }>;
const normalize = (url: string) => url.replace(/^=/, '').replace(/\{\{[^}]+\}\}/g, '{id}');

describe('package metadata', () => {
	it('has n8n keyword, registers built files, no runtime dependencies', () => {
		expect(pkg.name.startsWith('n8n-nodes-')).toBe(true);
		expect(pkg.keywords).toContain('n8n-community-node-package');
		expect(pkg.n8n.credentials).toEqual(['dist/credentials/WaveForgeApi.credentials.js']);
		expect(pkg.n8n.nodes).toHaveLength(2);
		expect((pkg as Record<string, unknown>).dependencies).toBeUndefined();
	});
});

describe('credentials', () => {
	const c = new WaveForgeApi();
	it('sends Bearer header from masked API key', () => {
		expect(c.properties[0].typeOptions?.password).toBe(true);
		expect((c.authenticate as any).properties.headers.Authorization).toBe(
			'=Bearer {{$credentials.apiKey}}',
		);
	});
	it('tests against authenticated presets GET', () => {
		expect(c.test.request.baseURL).toBe('https://waveforge.net');
		expect(c.test.request.url).toBe('/api/v1/presets');
	});
});

describe('WaveForge node routing', () => {
	it('uses only confirmed endpoints', () => {
		const used = [...ops('render'), ...ops('preset')].map(
			(o) => `${o.routing.request.method} ${normalize(o.routing.request.url)}`,
		);
		expect(used.sort()).toEqual([...CONFIRMED].sort());
	});
	it('maps create fields to the CreateRender body', () => {
		const props = node.description.properties;
		const title = props.find((p) => p.name === 'title')!;
		expect(title.required).toBe(true);
		expect(title.routing?.send).toEqual({ type: 'body', property: 'title' });
		const extra = props.find((p) => p.name === 'additionalFields')!.options as INodeProperties[];
		const sent = extra.map((o) => o.routing?.send?.property).sort();
		expect(sent).toEqual([
			'artist',
			'audioKey',
			'format',
			'imageKey',
			'imageUrl',
			'includeOutro',
			'preset',
			'resolution',
		]);
		const formats = (
			extra.find((o) => o.name === 'format')!.options as Array<{ value: string }>
		).map((o) => o.value);
		expect(formats.sort()).toEqual(['canvas', 'landscape', 'square', 'vertical']);
	});
	it('URL-encodes render IDs', () => {
		const get = ops('render').find((o) => o.value === 'get')!;
		expect(get.routing.request.url).toContain('encodeURIComponent($parameter.renderId)');
	});
});

function pollCtx(
	event: string,
	renders: unknown[],
	mode = 'trigger',
	staticData: Record<string, unknown> = {},
) {
	const http = vi.fn().mockResolvedValue({ livemode: false, renders });
	const ctx = {
		getNode: () => ({
			name: 'WaveForge Trigger',
			type: 'waveForgeTrigger',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getNodeParameter: () => event,
		getWorkflowStaticData: () => staticData,
		getMode: () => mode,
		helpers: {
			httpRequestWithAuthentication: http,
			returnJsonArray: (a: unknown[]) => a.map((json) => ({ json })),
		},
	};
	return { ctx, http, staticData };
}

describe('WaveForge Trigger (mocked HTTP)', () => {
	const t = new WaveForgeTrigger();
	const a = { id: 'test_a', status: 'completed' };
	const b = { id: 'test_b', status: 'failed' };
	const c = { id: 'test_c', status: 'processing' };

	it('calls the confirmed list endpoint with the credential', async () => {
		const { ctx, http } = pollCtx('completed', [a]);
		await t.poll.call(ctx as any);
		expect(http).toHaveBeenCalledWith(
			'waveForgeApi',
			expect.objectContaining({
				method: 'GET',
				url: 'https://waveforge.net/api/v1/renders',
				qs: { limit: 50 },
			}),
		);
	});
	it('primes on first run without emitting old renders', async () => {
		const { ctx } = pollCtx('completed', [a]);
		expect(await t.poll.call(ctx as any)).toBeNull();
	});
	it('emits only newly completed renders afterwards', async () => {
		const s = { primed: true, seen: ['test_a'] };
		const d = { id: 'test_d', status: 'completed' };
		const { ctx } = pollCtx('completed', [d, a, b, c], 'trigger', s);
		expect(await t.poll.call(ctx as any)).toEqual([[{ json: d }]]);
		expect(await t.poll.call(pollCtx('completed', [d, a], 'trigger', s).ctx as any)).toBeNull();
	});
	it('finished event covers completed and failed', async () => {
		const { ctx } = pollCtx('finished', [a, b, c], 'trigger', { primed: true, seen: [] });
		expect(await t.poll.call(ctx as any)).toEqual([[{ json: a }, { json: b }]]);
	});
	it('manual mode returns one sample', async () => {
		const { ctx } = pollCtx('completed', [a], 'manual');
		expect(await t.poll.call(ctx as any)).toEqual([[{ json: a }]]);
	});
	it('propagates API errors', async () => {
		const { ctx, http } = pollCtx('completed', []);
		http.mockRejectedValueOnce(new Error('401 Missing or unknown key'));
		await expect(t.poll.call(ctx as any)).rejects.toThrow('401');
	});
});

// State regression cases do not use the network.
describe('terminal history and envelope validation', () => {
	const t = new WaveForgeTrigger();
	const a = { id: 'a', status: 'completed' };
	const run = (renders: unknown[], s: Record<string, unknown>) =>
		t.poll.call(pollCtx('finished', renders, 'trigger', s).ctx as any);
	it('retains disappeared IDs and deduplicates a single page', async () => {
		const s = {};
		await run([], s);
		expect(await run([a, a], s)).toEqual([[{ json: a }]]);
		await run([], s);
		await run([{ id: 'other', status: 'processing' }], s);
		expect(await run([a], s)).toBeNull();
	});
	it('processing becomes completed exactly once', async () => {
		const s = {};
		await run([{ ...a, status: 'processing' }], s);
		expect(await run([a], s)).toEqual([[{ json: a }]]);
		expect(await run([a], s)).toBeNull();
	});
	it.each([
		{},
		{ renders: null },
		{ renders: {} },
		{ renders: [{ id: '', status: 'completed' }] },
		{ renders: [{ id: '  ', status: 'completed' }] },
		{ renders: [{ id: 1, status: 'completed' }] },
		{ renders: [{ id: 'a', status: 'unknown' }] },
		{ renders: [null] },
		{ renders: [{ id: 'a' }] },
	])('rejects malformed initial/later envelopes atomically: %j', async (bad) => {
		for (const s of [{}, { primed: true, seen: ['a'] }]) {
			const before = structuredClone(s);
			const { ctx, http } = pollCtx('finished', [], 'trigger', s);
			http.mockResolvedValueOnce(bad as any);
			await expect(t.poll.call(ctx as any)).rejects.toThrow('Malformed');
			expect(s).toEqual(before);
		}
	});
	it('bad first poll does not prime; next valid poll establishes baseline', async () => {
		const s = {};
		const { ctx, http } = pollCtx('finished', [], 'trigger', s);
		http.mockResolvedValueOnce({} as any);
		await expect(t.poll.call(ctx as any)).rejects.toThrow();
		expect(await run([a], s)).toBeNull();
	});
	it('keeps FIFO bounded at 10,000 and repeats do not refresh retention', async () => {
		const s = { primed: true, seen: Array.from({ length: 10000 }, (_, i) => String(i)) };
		await run(
			[
				{ id: '0', status: 'completed' },
				{ id: 'new', status: 'completed' },
			],
			s,
		);
		expect(s.seen).toHaveLength(10000);
		expect(s.seen[0]).toBe('1');
		expect(s.seen.at(-1)).toBe('new');
	});
	it('manual mode never mutates state', async () => {
		const s = { primed: true, seen: ['old'] };
		await t.poll.call(pollCtx('finished', [a], 'manual', s).ctx as any);
		expect(s).toEqual({ primed: true, seen: ['old'] });
	});
});
