"use client";

import Close from "@carbon/icons-react/es/Close";
import Flag from "@carbon/icons-react/es/Flag";
import { Button } from "@crm/ui/components/button";
import { FieldError } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Label } from "@crm/ui/components/label";
import { RuleTree, type RuleTreeValue } from "@crm/ui/components/rule-tree";
import { Spinner } from "@crm/ui/components/spinner";
import { Switch } from "@crm/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type SegmentChoice,
	SegmentPicker,
	splitSegments,
} from "@/components/marketing/segment-picker";
import { useMarketingFacets } from "@/components/marketing/use-marketing-facets";
import {
	fromDefinition,
	ruleProblems,
	toDefinition,
} from "@/lib/marketing-facets";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Campaign = RouterOutputs["marketingCampaigns"]["byId"];

const ALWAYS_ON = [
	"They unsubscribed, bounced or complained.",
	"They replied to a touch in this campaign.",
];

function Section({
	title,
	note,
	children,
}: {
	title: string;
	note?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<Label className="font-medium text-xs">{title}</Label>
				{note ? (
					<span className="text-muted-foreground text-xs">{note}</span>
				) : null}
			</div>
			{children}
		</div>
	);
}

export function AudienceSheet({
	campaign,
	onClose,
	onChanged,
}: {
	campaign: Campaign;
	onClose: () => void;
	onChanged: () => void;
}) {
	const trpc = useTRPC();
	const facets = useMarketingFacets();

	const [source, setSource] = useState<"segment" | "rules">(
		campaign.segments.length > 0 || !campaign.entryDefinition
			? "segment"
			: "rules",
	);
	const [chosen, setChosen] = useState<SegmentChoice[]>(campaign.segments);
	const [automatic, setAutomatic] = useState(
		campaign.entryMode === "CONTINUOUS",
	);
	const [entry, setEntry] = useState<RuleTreeValue>(() =>
		fromDefinition(campaign.entryDefinition),
	);
	const [exit, setExit] = useState<RuleTreeValue>(() =>
		fromDefinition(campaign.exitDefinition),
	);

	const entryDefinition = useMemo(() => toDefinition(entry), [entry]);
	const exitDefinition = useMemo(() => toDefinition(exit), [exit]);

	const problems = useMemo(
		() => [
			...(source === "rules" ? ruleProblems(entry) : []),
			...ruleProblems(exit),
		],
		[source, entry, exit],
	);

	const previewOptions = trpc.marketingSegments.preview.queryOptions({
		definition: (entryDefinition ?? {}) as Record<string, unknown>,
	});

	const preview = useQuery({
		queryKey: previewOptions.queryKey,
		queryFn: previewOptions.queryFn,
		enabled: source === "rules" && entryDefinition !== null,
	});

	const save = useMutation(
		trpc.marketingCampaigns.update.mutationOptions({
			onSuccess: () => {
				toast.success(
					"Saved. This changes who enters next, not who is already inside.",
				);
				onChanged();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const links = splitSegments(chosen);

	const picked =
		source === "segment"
			? links.segmentIds.length > 0
			: Boolean(entryDefinition);

	const same =
		links.segmentIds.length + links.excludeSegmentIds.length ===
			campaign.segments.length &&
		chosen.every((one) =>
			campaign.segments.some(
				(saved) => saved.id === one.id && saved.mode === one.mode,
			),
		);

	const matching =
		source === "segment"
			? same
				? campaign.audience.total
				: null
			: (preview.data?.total ?? null);

	return (
		<aside className="flex w-[460px] shrink-0 flex-col overflow-hidden border-l bg-background">
			<header className="flex h-13 shrink-0 items-center gap-2 border-b px-4 py-3">
				<Icon icon={Flag} className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="font-medium text-xs">Who walks this campaign</span>
				<div className="flex-1" />
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					aria-label="Close"
				>
					<Icon icon={Close} />
				</Button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
				<Section
					title="Who enters"
					note="A saved segment is shared with every other campaign, so editing it once fixes them all. A rule here belongs to this campaign alone."
				>
					<ToggleGroup
						type="single"
						value={source}
						onValueChange={(next) =>
							setSource(next === "rules" ? "rules" : "segment")
						}
					>
						<ToggleGroupItem value="segment">A segment</ToggleGroupItem>
						<ToggleGroupItem value="rules">A rule</ToggleGroupItem>
					</ToggleGroup>

					{source === "segment" ? (
						<SegmentPicker value={chosen} onChange={setChosen} />
					) : (
						<RuleTree value={entry} facets={facets} onChange={setEntry} />
					)}

					<span className="text-muted-foreground text-xs">
						{!picked
							? "Nobody enters until you pick one."
							: matching === null
								? "Counting…"
								: `${matching.toLocaleString()} people match today.`}
					</span>
				</Section>

				<Section
					title="When they enter"
					note="Automatic sweeps every tick and enrols anybody who newly matches. Manual waits for a person to enrol them from the contact sheet."
				>
					<div className="flex items-center gap-3">
						<Switch
							id="entry-automatic"
							checked={automatic}
							onCheckedChange={setAutomatic}
						/>
						<Label htmlFor="entry-automatic" className="text-xs">
							Let people in automatically
						</Label>
					</div>
				</Section>

				<Section
					title="Who leaves early"
					note="Checked every tick, not before each step. Somebody whose deal closes between touch 4 and touch 5 leaves then, not in nine days."
				>
					<RuleTree value={exit} facets={facets} onChange={setExit} />

					<div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2.5">
						<span className="font-medium text-xs">Always on</span>
						{ALWAYS_ON.map((line) => (
							<span key={line} className="text-muted-foreground text-xs">
								{line}
							</span>
						))}
						<span className="text-muted-foreground text-xs">
							You cannot turn these off, and no rule here overrules them.
						</span>
					</div>
				</Section>

				<FieldError errors={problems} />

				<div className="flex items-center gap-2">
					<Button
						disabled={save.isPending || problems.length > 0}
						onClick={() =>
							save.mutate({
								id: campaign.id,
								segmentIds: source === "segment" ? links.segmentIds : [],
								excludeSegmentIds:
									source === "segment" ? links.excludeSegmentIds : [],
								entryDefinition: source === "rules" ? entryDefinition : null,
								exitDefinition,
								entryMode: automatic ? "CONTINUOUS" : "MANUAL",
							})
						}
					>
						{save.isPending ? <Spinner /> : null}
						Save
					</Button>
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
				</div>
			</div>
		</aside>
	);
}
