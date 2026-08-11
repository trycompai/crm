"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import type { PickerChannel } from "./channel-picker";

export const SLACK_CHANNELS = {
	pollMs: 3_000,
	searchDebounceMs: 250,
} as const;

export type SlackChannelList = {
	canInviteItself: boolean;
	channels: PickerChannel[];
	fetchingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	pending: boolean;
	reload: () => Promise<unknown>;
	stalled: boolean;
	syncing: boolean;
};

export function useSlackChannels({
	enabled = true,
	query = "",
}: {
	enabled?: boolean;
	query?: string;
} = {}): SlackChannelList {
	const trpc = useTRPC();
	const needle = query.trim();

	const channels = useInfiniteQuery({
		...trpc.slack.channels.infiniteQueryOptions(
			{ query: needle || undefined },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
		enabled,
		refetchInterval: (result) =>
			result.state.data?.pages[0]?.sync === "syncing"
				? SLACK_CHANNELS.pollMs
				: false,
	});

	const pages = channels.data?.pages ?? [];
	const sync = pages[0]?.sync ?? "idle";

	return {
		canInviteItself: pages[0]?.canInviteItself ?? false,
		channels: pages.flatMap((page) => page.rows),
		fetchingMore: channels.isFetchingNextPage,
		hasMore: channels.hasNextPage,
		loadMore: () => void channels.fetchNextPage(),
		pending: channels.isPending,
		reload: () => channels.refetch(),
		stalled: sync === "stalled",
		syncing: sync === "syncing",
	};
}
