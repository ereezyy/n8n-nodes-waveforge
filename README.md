# n8n-nodes-waveforge

n8n community node for [WaveForge](https://waveforge.net): turn a track into a music-video render from an n8n workflow.

## Installation

Release candidate: not yet published to npm. After publication, on a self-hosted n8n instance:

1. Open **Settings → Community Nodes → Install** as the instance owner/admin.
2. Enter `n8n-nodes-waveforge`, acknowledge the risks of installing community nodes, and select **Install**.
3. Add **WaveForge** or **WaveForge Trigger** to a workflow and select a **WaveForge API** credential.

See [n8n community node installation](https://docs.n8n.io/integrations/community-nodes/installation/) for manual installation and instance restrictions. n8n Cloud availability depends on n8n verification; it is not claimed here.

## Credentials

Obtain an API key from [WaveForge](https://waveforge.net) (see the [developer page](https://waveforge.net/developers)) and enter it in a **WaveForge API** credential in n8n.
The key is sent as `Authorization: Bearer <key>`. Never put it in workflow text or source control. Live keys use videos from your WaveForge plan. Test keys (wf_test_…) don't use any videos and don't encode a real video. No test key was used for this package's mocked tests.

## Operations

**WaveForge** node

- Render → Create (`POST /api/v1/renders`): title (required), audio URL, plus artist, preset, format (landscape, vertical, square, Spotify canvas), resolution, image URL, audio/image key, include outro
- Render → Get (`GET /api/v1/renders/{id}`): status (`pending`, `processing`, `completed`, `failed`) and progress
- Render → Get Output (`GET /api/v1/renders/{id}/output`): video URL; returns 409 until the render is completed
- Render → Get Many (`GET /api/v1/renders?limit=`)
- Preset → Get Many (`GET /api/v1/presets`)

**WaveForge Trigger** (polling): fires when a render reaches Completed, Failed, or either, by polling `GET /api/v1/renders`. The first valid poll only records existing terminal renders. Coverage is bounded and best-effort: only the latest 50 renders per poll, with no pagination supported by the pinned API contract. Busy bursts and displaced long-running renders can be missed. The trigger retains the last 10,000 distinct terminal IDs in FIFO first-observed order (no time expiry; repeats do not refresh retention). Disappearance/reappearance does not fire again while retained; an evicted ID can fire again. Manual samples do not change state. Changing credentials or event selection requires a fresh node/state baseline.

Render Create is not idempotent. Retrying a POST or workflow can create duplicate renders and use additional videos; check the original result before retrying. No idempotency-key support is claimed.

Typical flow: Create → Wait → Get (loop until `completed`) → Get Output, or Create in one workflow and the Trigger in another.

## Compatibility

Built with `@n8n/node-cli` 0.55.5, n8n nodes API v1. No runtime dependencies. Built and offline-tested only against n8n-workflow 2.46.5. The peer declaration remains `*` because n8n's mandatory strict lint requires it; this does not claim compatibility with untested versions. `n8n-workflow` is marked as an optional peer so npm 7+ will not auto-install it (or its native `isolated-vm` add-on) when this package is installed outside a host n8n instance. The host n8n installation still provides `n8n-workflow` at runtime. No n8n application version is yet certified: activation, restart persistence, overlapping polls and UI behavior have not been integration-tested. Other workflow versions are unsupported until tested.

## Development

```
npm ci
npm run build
npm run lint
npm test   # mocked HTTP only, no network or API key
```

## Resources

- API reference: https://waveforge.net/developers
- OpenAPI: https://waveforge.net/api/v1/openapi.yaml

## Deliberate omissions

The free teaser is MCP-only and is not included in this node. File upload and a webhook trigger are not implemented. The trigger polls; it is not a webhook receiver.
