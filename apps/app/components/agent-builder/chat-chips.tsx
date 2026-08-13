import Close from "@carbon/icons-react/es/Close";
import Document from "@carbon/icons-react/es/Document";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentMedia,
	AttachmentTitle,
} from "@crm/ui/components/attachment";
import { Avatar, AvatarFallback, AvatarImage } from "@crm/ui/components/avatar";
import { type CarbonIcon, Icon } from "@crm/ui/components/icon";
import {
	TokenFieldAction,
	TokenFieldItem,
} from "@crm/ui/components/token-field";
import { cn } from "@crm/ui/lib/utils";
import Image from "next/image";
import { isSupportedImageType } from "@/lib/agent-attachments";

type ChatChipVariant = "default" | "composer";

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
	variant = "default",
}: {
	resource: ChatChipResource;
	icon: CarbonIcon;
	onRemove?: () => void;
	variant?: ChatChipVariant;
}) {
	const identity = (
		<ChatReferenceIdentity
			resource={resource}
			icon={icon}
			showDetail={false}
			compact={variant === "composer"}
		/>
	);

	if (variant === "composer") {
		return (
			<TokenFieldItem>
				{identity}
				{onRemove ? (
					<TokenFieldAction
						aria-label={`Remove ${resource.label}`}
						onClick={onRemove}
					>
						<Icon icon={Close} className="size-3" />
					</TokenFieldAction>
				) : null}
			</TokenFieldItem>
		);
	}

	return (
		<span className="flex min-w-0 max-w-full items-center gap-1 rounded-sm border bg-background py-0.5 pr-1 pl-0.5 text-left">
			{identity}
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
	showDetail = true,
	compact = false,
}: {
	resource: ChatChipResource;
	icon: CarbonIcon;
	showDetail?: boolean;
	compact?: boolean;
}) {
	return (
		<>
			<Avatar size={compact ? "xs" : "sm"}>
				{resource.imageUrl ? (
					<AvatarImage src={resource.imageUrl} alt="" />
				) : null}
				<AvatarFallback>
					<Icon icon={icon} className="size-3" />
				</AvatarFallback>
			</Avatar>
			<span className={cn("min-w-0 max-w-48", compact && "max-w-40")}>
				<span className="block truncate font-medium text-xs">
					{resource.label}
				</span>
				{showDetail && resource.detail ? (
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
	variant = "default",
}: {
	attachment: ChatChipAttachment;
	onRemove?: () => void;
	variant?: ChatChipVariant;
}) {
	const label = `${attachment.name} · ${formatBytes(attachment.size)}`;
	const image = isSupportedImageType(attachment.type)
		? (attachment.previewUrl ??
			(attachment.contentBase64
				? `data:${attachment.type};base64,${attachment.contentBase64}`
				: null))
		: null;

	return (
		<Attachment
			size={variant === "composer" ? "token" : "compact"}
			state="done"
		>
			<AttachmentMedia variant={image ? "image" : "icon"}>
				{image ? (
					<Image
						src={image}
						alt=""
						width={20}
						height={20}
						unoptimized
						className="size-full object-cover"
					/>
				) : (
					<Icon icon={Document} />
				)}
			</AttachmentMedia>
			<AttachmentContent>
				<AttachmentTitle title={label}>{label}</AttachmentTitle>
			</AttachmentContent>
			{onRemove ? (
				<AttachmentActions>
					<AttachmentAction
						type="button"
						aria-label={`Remove ${attachment.name}`}
						onClick={onRemove}
					>
						<Icon icon={Close} />
					</AttachmentAction>
				</AttachmentActions>
			) : null}
		</Attachment>
	);
}

export function ChatCommandChip({
	label,
	icon,
	onRemove,
	variant = "default",
}: {
	label: string;
	icon: CarbonIcon;
	onRemove?: () => void;
	variant?: ChatChipVariant;
}) {
	if (variant === "composer") {
		return (
			<TokenFieldItem className="pl-1.5">
				<Icon icon={icon} className="size-3.5" />
				<span className="font-medium">{label}</span>
				{onRemove ? (
					<TokenFieldAction aria-label={`Remove ${label}`} onClick={onRemove}>
						<Icon icon={Close} className="size-3" />
					</TokenFieldAction>
				) : null}
			</TokenFieldItem>
		);
	}

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
