import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	// third_party/ is vendored, unmodified upstream source (see third_party/*/NOTICE.md) —
	// lint it at the upstream project, not here.
	{ ignores: ['third_party'] },
	...configWithoutCloudSupport,
];
