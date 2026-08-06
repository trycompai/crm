import Close from "@carbon/icons-react/es/Close";
import Document from "@carbon/icons-react/es/Document";
import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { type CarbonIcon, Icon } from "@crm/ui/components/icon";
import Image from "next/image";

export type ChatChipResource = {
	kind: "integration" | "company" | "contact" | "deal";
	id: string;
	label: string;
	detail?: string | null;
	imageUrl?: string | null;
};

export type ChatChipAttachment = {
	id?: string;
	name: string;
	type: string;
	size: number;
	contentBase64?: string;
	previewUrl?: string | null;
};

export function ChatReferenceChip({
	resource,
	icon,
	onRemove,
}: {
	resource: ChatChipResource;
	icon: CarbonIcon;
	onRemove?: () => void;
}) {
	return (
		<span className="flex min-w-0 max-w-full items-center gap-2 rounded-md border bg-background py-1 pr-2 pl-1 text-left shadow-xs">
			<ChatReferenceIdentity resource={resource} icon={icon} />
			{onRemove ? (
				<button
					type="button"
					aria-label={`Remove ${resource.label}`}
					onClick={onRemove}
					className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<Icon icon={Close} className="size-3" />
				</button>
			) : null}
		</span>
	);
}

export function ChatReferenceIdentity({
	resource,
	icon,
}: {
	resource: ChatChipResource;
	icon: CarbonIcon;
}) {
	return (
		<>
			<Avatar size="sm">
				{resource.imageUrl ? (
					<AvatarImage src={resource.imageUrl} alt="" />
				) : null}
				<AvatarFallback>
					<Icon icon={icon} className="size-3" />
				</AvatarFallback>
			</Avatar>
			<span className="min-w-0 max-w-48">
				<span className="block truncate font-medium text-xs">
					{resource.label}
				</span>
				{resource.detail ? (
					<span className="block truncate text-[11px] text-muted-foreground">
						{resource.detail}
					</span>
				) : null}
			</span>
		</>
	);
}

export function ChatAttachmentChip({
	attachment,
	onRemove,
}: {
	attachment: ChatChipAttachment;
	onRemove?: () => void;
}) {
	const image = isPreviewableImage(attachment.type)
		? (attachment.previewUrl ??
			(attachment.contentBase64
				? `data:${attachment.type};base64,${attachment.contentBase64}`
				: null))
		: null;

	return (
		<span className="flex min-w-0 max-w-full items-center gap-2 rounded-md border bg-background py-1 pr-2 pl-1 text-left shadow-xs">
			<span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-muted-foreground">
				{image ? (
					<Image
						src={image}
						alt=""
						width={24}
						height={24}
						unoptimized
						className="size-full object-cover"
					/>
				) : (
					<Icon icon={Document} className="size-3.5" />
				)}
			</span>
			<span className="min-w-0 max-w-48">
				<span className="block truncate font-medium text-xs">
					{attachment.name}
				</span>
				<span className="block text-[11px] text-muted-foreground">
					{formatBytes(attachment.size)}
				</span>
			</span>
			{onRemove ? (
				<button
					type="button"
					aria-label={`Remove ${attachment.name}`}
					onClick={onRemove}
					className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<Icon icon={Close} className="size-3" />
				</button>
			) : null}
		</span>
	);
}

export function ChatCommandChip({
	label,
	icon,
	onRemove,
}: {
	label: string;
	icon: CarbonIcon;
	onRemove?: () => void;
}) {
	return (
		<span className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-2 text-primary-foreground text-xs">
			<Icon icon={icon} className="size-3.5" />
			<span className="font-medium">{label}</span>
			{onRemove ? (
				<button
					type="button"
					aria-label={`Remove ${label}`}
					onClick={onRemove}
					className="-mr-1 flex size-5 items-center justify-center rounded-sm outline-none hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
				>
					<Icon icon={Close} className="size-3" />
				</button>
			) : null}
		</span>
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewableImage(mediaType: string): boolean {
	return ["image/gif", "image/jpeg", "image/png", "image/webp"].includes(
		mediaType.toLowerCase(),
	);
}
