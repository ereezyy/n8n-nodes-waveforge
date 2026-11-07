/* eslint-disable @typescript-eslint/no-explicit-any -- offline declarative routing adapter */
// Offline fixture reader only; excluded from the published package.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { WaveForge } from '../nodes/WaveForge/WaveForge.node';
import { WaveForgeApi } from '../credentials/WaveForgeApi.credentials';
import fixtures from '../contract/fixtures.json';
import provenance from '../contract/provenance.json';
const read = (name: string) =>
	readFileSync(new URL('../contract/' + name, import.meta.url), 'utf8');
const spec = parse(read('openapi-2026-11-07.yaml'));
const node = new WaveForge();
const props = node.description.properties as any[];
const operations = props
	.filter((p) => p.name === 'operation')
	.flatMap((p) =>
		p.options.map((o: any) => ({ ...o, resource: p.displayOptions.show.resource[0] })),
	);
// Execute the expressions and routing.send rules from the node description, not copied routes.
// This is an offline adapter for the declarative subset in this package, not n8n-core serialization.
function expression(value: string, params: any, field?: unknown): any {
	if (!value.startsWith('=')) return value;
	const text = value.slice(1);
	const exact = text.match(/^\{\{(.*)\}\}$/);
	const evaluate = (js: string) => {
		if (js === '$value || undefined') return field || undefined;
		if (js === 'encodeURIComponent($parameter.renderId)')
			return encodeURIComponent(params.renderId);
		throw new Error('Unsupported routing expression in offline adapter: ' + js);
	};
	return exact ? evaluate(exact[1]) : text.replace(/\{\{(.*?)\}\}/g, (_, js) => evaluate(js));
}
function request(op: any, params: any) {
	const body: any = {},
		qs: any = {};
	for (const p of props) {
		const show = p.displayOptions?.show;
		if (!show?.operation?.includes(op.value) || !show.resource.includes(op.resource)) continue;
		const fields = p.type === 'collection' ? p.options : [p];
		for (const f of fields) {
			const send = f.routing?.send;
			if (!send) continue;
			const value =
				p.type === 'collection' ? params[p.name]?.[f.name] : (params[f.name] ?? f.default);
			if (value === undefined) continue;
			const v = send.value ? expression(send.value, params, value) : value;
			if (v !== undefined) (send.type === 'query' ? qs : body)[send.property] = v;
		}
	}
	return {
		method: op.routing.request.method,
		url: node.description.requestDefaults!.baseURL + expression(op.routing.request.url, params),
		body,
		qs,
	};
}
const params = {
	title: 'Fixture track',
	audioUrl: 'https://example.com/audio.mp3',
	renderId: 'id/with space',
	limit: 50,
	additionalFields: {
		artist: 'Artist',
		preset: 'cline',
		format: 'vertical',
		resolution: '720x1280',
		includeOutro: false,
		audioKey: 'audio/fixture',
		imageKey: 'image/fixture',
		imageUrl: 'https://example.com/image.png',
	},
};
function validateBody(body: any) {
	const schema = spec.components.schemas.CreateRender;
	for (const key of schema.required) expect(body).toHaveProperty(key);
	for (const [key, value] of Object.entries(body)) {
		const def = schema.properties[key];
		expect(def, key).toBeDefined();
		expect(typeof value).toBe(def.type);
		if (def.enum) expect(def.enum).toContain(value);
		if (def.format === 'uri') expect(() => new URL(value as string)).not.toThrow();
	}
}
describe('independent pinned API contract', () => {
	it('pins every independent input by SHA-256', () => {
		for (const [name, meta] of Object.entries(provenance.files))
			expect(createHash('sha256').update(read(name)).digest('hex')).toBe(meta.sha256);
	});
	it.each(operations)(
		'derives $resource $value method URL body/query from declarative routing',
		(op) => {
			const req = request(op, params);
			const url = new URL(req.url);
			expect(url.origin).toBe(spec.servers[0].url);
			const path = url.pathname.replace('id%2Fwith%20space', '{id}');
			const contract = spec.paths[path]?.[req.method.toLowerCase()];
			expect(contract).toBeDefined();
			if (req.method === 'POST') validateBody(req.body);
			else expect(req.body).toEqual({});
			for (const [key, value] of Object.entries(req.qs)) {
				const param = contract.parameters.find((p: any) => p.in === 'query' && p.name === key);
				expect(param).toBeDefined();
				expect(value).toBeGreaterThanOrEqual(param.schema.minimum);
				expect(value).toBeLessThanOrEqual(param.schema.maximum);
			}
		},
	);
	it('minimal Create body meets required fields and blank optional audio URL is omitted', () => {
		const op = operations.find((o) => o.value === 'create');
		const req = request(op, { title: 'Title' });
		validateBody(req.body);
		expect(req.body).toEqual({ title: 'Title' });
		expect(props.find((p) => p.name === 'title').required).toBe(true);
		const required = props
			.filter((p) => p.displayOptions?.show?.operation?.includes('create') && p.required)
			.map((p) => p.name);
		expect(required).toEqual(spec.components.schemas.CreateRender.required);
	});
	it('all advertised formats match the pinned enum and list limits match the contract', () => {
		const extra = props.find((p) => p.name === 'additionalFields').options;
		expect(
			extra
				.find((p: any) => p.name === 'format')
				.options.map((o: any) => o.value)
				.sort(),
		).toEqual([...spec.components.schemas.CreateRender.properties.format.enum].sort());
		const limit = props.find((p) => p.name === 'limit');
		const def = spec.paths['/api/v1/renders'].get.parameters[0].schema;
		expect(limit.typeOptions).toMatchObject({ minValue: def.minimum, maxValue: def.maximum });
	});
	it('checks response extraction against independently sourced envelopes', () => {
		for (const op of operations) {
			const fixture = (fixtures as any)[
				op.resource === 'preset'
					? 'presets'
					: ({ create: 'create', get: 'get', getAll: 'list', getOutput: 'output' } as any)[op.value]
			];
			const actions = op.routing.output?.postReceive ?? [];
			for (const action of actions)
				expect(Array.isArray(fixture[action.properties.property])).toBe(true);
		}
		expect(read('routes.ts.207-294.txt')).toContain('res.json({ presets: listPresets() })');
		expect(read('routes.ts.207-294.txt')).toContain('res.json({ livemode: true, renders })');
		expect(read('routes.ts.207-294.txt')).toContain('res.json(render)');
		expect(Object.keys(fixtures.create).sort()).toEqual(
			Object.keys(
				spec.paths['/api/v1/renders'].post.responses['201'].content['application/json'].schema
					.properties,
			).sort(),
		);
		expect(fixtures.list.renders[0]).toEqual(fixtures.get);
	});
	it('output 409 and URL-only response follow pinned route branch', () => {
		expect(spec.paths['/api/v1/renders/{id}/output'].get.responses).toHaveProperty('409');
		const route = read('routes.ts.207-294.txt');
		expect(route).toContain('render.status !== "completed" || !render.videoUrl');
		expect(route).toContain('res.status(409).json');
		expect(route).toContain('code: "' + fixtures.notReady.error.code + '"');
		expect(route).toContain(
			'res.json({ id: render.id, url: render.videoUrl, livemode: render.livemode })',
		);
		expect(Object.keys(fixtures.output).sort()).toEqual(['id', 'livemode', 'url']);
	});
	it('statuses, descending list order, limit clamp and no pagination are independently evidenced', () => {
		const statuses = read('testRenders.ts.7-17.txt');
		for (const status of fixtures.statuses) expect(statuses).toContain('"' + status + '"');
		expect(read('store.ts.367-378.txt')).toContain('.orderBy(desc(videoJobs.createdAt))');
		expect(read('testRenders.ts.33-43.txt')).toContain(
			'.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))',
		);
		expect(read('routes.ts.207-294.txt')).toContain(
			'Math.min(50, Math.max(1, Number(req.query.limit) || 20))',
		);
		expect(spec.paths['/api/v1/renders'].get.parameters.map((p: any) => p.name)).toEqual(['limit']);
	});
	it('test-key copy is supported by contract and independent test-mode branch (no key used)', () => {
		expect(spec.info.description).toMatch(/Test keys do not .* and do not encode/);
		expect(read('renderCreate.ts.222-239.txt')).toContain('if (!opts.principal.livemode)');
		expect(read('renderCreate.ts.222-239.txt')).toContain('createTestRender');
		expect(read('testRenders.ts.33-43.txt')).toContain('encoder');
		const desc = new WaveForgeApi().properties[0].description!;
		expect(desc).toContain("don't use any videos and don't encode a real video");
		expect(fixtures.create.livemode).toBe(false);
	});
});
