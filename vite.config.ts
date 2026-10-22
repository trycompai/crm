import { defineConfig } from "vite-plus";

export default defineConfig({
	check: {
		fmt: false,
	},
	fmt: {
		useTabs: true,
	},
	lint: {
		plugins: [],
		categories: {
			correctness: "off",
		},
		jsPlugins: [
			"./tools/oxlint/anti-slop/index.ts",
			{
				name: "vite-plus",
				specifier: "vite-plus/oxlint-plugin",
			},
		],
		ignorePatterns: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.next/**",
			"**/.eve/**",
			"**/.scratch/**",
			".agents/**",
			".claude/**",
			"apps/api/src/generated/**",
			"packages/db/src/generated/**",
			"packages/ui/src/components/**",
			"tools/oxlint/anti-slop/**",
		],
		rules: {
			"anti-slop/no-chained-type-assertions": "error",
			"anti-slop/no-conditional-empty-object-spread": "error",
			"anti-slop/no-known-value-widening": "error",
			"anti-slop/no-object-parameters": "error",
			"anti-slop/no-runtime-typeof": "error",
			"anti-slop/no-shape-in-symbol-names": "off",
			"anti-slop/no-unknown-parameters": "error",
			"anti-slop/no-unknown-type-aliases": "error",
			"anti-slop/no-unsafe-dictionary-type": "error",
			"anti-slop/no-widen-then-assert": "error",
			"vite-plus/prefer-vite-plus-imports": "error",
		},
		overrides: [
			{
				files: [
					"**/test/**",
					"**/tests/**",
					"**/evals/**",
					"**/*.spec.ts",
					"**/*.spec.tsx",
					"**/*.eval.ts",
				],
				rules: {
					"anti-slop/no-chained-type-assertions": "off",
				},
			},
			{
				files: ["packages/validation/src/**"],
				rules: {
					"anti-slop/no-unknown-parameters": "off",
				},
			},
			{
				files: [
					"packages/telemetry/src/**",
					"apps/api/src/logging/**",
					"packages/db/src/fields.ts",
					"packages/db/src/fields-shape.ts",
					"apps/api/src/fields/**",
					"apps/app/components/crm/inline-field.tsx",
				],
				rules: {
					"anti-slop/no-unsafe-dictionary-type": "off",
					"anti-slop/no-unknown-parameters": "off",
					"anti-slop/no-runtime-typeof": "off",
				},
			},
		],
	},
});
