"use client";

import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "./client";

type Settle = "all" | "record";

type Options = {
	settle?: Settle;
};

type RemovedRecord = { kind: "company" | "contact" | "deal"; id: string };

export type CrmCache = {
	company(id?: string, options?: Options): Promise<void>;
	contact(id?: string, options?: Options): Promise<void>;
	deal(id?: string, options?: Options): Promise<void>;
	removed(record: RemovedRecord): Promise<void>;
	activity(options?: Options): Promise<void>;
	google(options?: Options): Promise<void>;
	settings(options?: Options): Promise<void>;
	prospecting(id?: string, options?: Options): Promise<void>;
	workspace(options?: Options): Promise<void>;
	sso(options?: Options): Promise<void>;
	everything(): Promise<void>;
};

export function useCrmCache(): CrmCache {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const run = (
		record: QueryKey[],
		rest: QueryKey[],
		{ settle = "all" }: Options = {},
	): Promise<void> => {
		const awaited = settle === "all" ? [...record, ...rest] : record;
		const behind = settle === "all" ? [] : rest;

		for (const queryKey of behind) {
			void queryClient.invalidateQueries({ queryKey });
		}

		return Promise.all(
			awaited.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
		).then(() => undefined);
	};

	const activityKeys = () => [
		trpc.activities.timeline.pathKey(),
		trpc.activities.timelineCounts.queryKey(),
		trpc.activities.myTasks.queryKey(),
	];

	const listKeys = () => [
		trpc.companies.list.queryKey(),
		trpc.contacts.list.queryKey(),
		trpc.deals.list.queryKey(),
		trpc.search.quick.queryKey(),
	];

	return {
		company: (id, options) =>
			run(
				[
					id
						? trpc.companies.byId.queryKey({ id })
						: trpc.companies.byId.queryKey(),
				],
				[
					...listKeys(),
					trpc.contacts.byId.queryKey(),
					trpc.deals.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		contact: (id, options) =>
			run(
				[
					id
						? trpc.contacts.byId.queryKey({ id })
						: trpc.contacts.byId.queryKey(),
				],
				[
					...listKeys(),
					trpc.companies.byId.queryKey(),
					trpc.deals.byId.queryKey(),
				],
				options,
			),

		deal: (id, options) =>
			run(
				[id ? trpc.deals.byId.queryKey({ id }) : trpc.deals.byId.queryKey()],
				[
					...listKeys(),
					trpc.companies.byId.queryKey(),
					...activityKeys(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		removed: ({ kind, id }) => {
			const goneKey = {
				company: trpc.companies.byId,
				contact: trpc.contacts.byId,
				deal: trpc.deals.byId,
			}[kind].queryKey({ id });
			const gone = JSON.stringify(goneKey);

			for (const record of [
				trpc.companies.byId,
				trpc.contacts.byId,
				trpc.deals.byId,
			]) {
				void queryClient.invalidateQueries({
					queryKey: record.queryKey(),
					predicate: (query) => JSON.stringify(query.queryKey) !== gone,
				});
			}

			void queryClient.invalidateQueries({
				queryKey: goneKey,
				exact: true,
				refetchType: "none",
			});

			return run(
				[...listKeys(), ...activityKeys(), trpc.dashboard.summary.queryKey()],
				[],
			);
		},

		activity: (options) =>
			run(
				activityKeys(),
				[
					...listKeys(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					trpc.deals.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		google: (options) =>
			run(
				[trpc.google.status.queryKey()],
				[
					...activityKeys(),
					...listKeys(),
					trpc.companies.byId.queryKey(),
					trpc.contacts.byId.queryKey(),
					trpc.dashboard.summary.queryKey(),
				],
				options,
			),

		settings: (options) =>
			run(
				[
					trpc.settings.agentModel.queryKey(),
					trpc.settings.researchKey.queryKey(),
				],
				[],
				options,
			),

		workspace: (options) =>
			run(
				[trpc.workspace.get.queryKey(), trpc.workspace.members.queryKey()],
				[],
				options,
			),

		sso: (options) =>
			run(
				[trpc.sso.list.pathKey()],
				[trpc.sso.settings.queryKey(), trpc.sso.signInOptions.queryKey()],
				options,
			),

		prospecting: (id, options) =>
			run(
				[
					trpc.prospecting.list.pathKey(),
					id
						? trpc.prospecting.byId.queryKey({ id })
						: trpc.prospecting.byId.queryKey(),
				],
				[trpc.prospecting.products.queryKey()],
				options,
			),

		everything: () => queryClient.invalidateQueries(),
	};
}
