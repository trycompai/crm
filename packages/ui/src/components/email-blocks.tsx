"use client";

import Add from "@carbon/icons-react/es/Add";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import ChevronUp from "@carbon/icons-react/es/ChevronUp";
import Close from "@carbon/icons-react/es/Close";
import Draggable from "@carbon/icons-react/es/Draggable";
import Locked from "@carbon/icons-react/es/Locked";
import { type ReactNode, useId, useRef, useState } from "react";
import { Button } from "./button";
import { Field, FieldLabel } from "./field";
import { Icon } from "./icon";
import { Input } from "./input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./dropdown-menu";
import { Textarea } from "./textarea";
import { cn } from "../lib/utils";

export type EmailInline = { text: string; bold?: boolean; italic?: boolean; href?: string };

export type EmailBlock =
	| { type: "heading"; level: 1 | 2 | 3; text: EmailInline[] }
	| { type: "text"; text: EmailInline[] }
	| { type: "button"; label: string; href: string }
	| { type: "image"; src: string; alt: string }
	| { type: "quote"; text: EmailInline[] }
	| { type: "divider" }
	| { type: "spacer"; size: "sm" | "md" | "lg" }
	| { type: "columns"; columns: EmailBlock[][] };

export const BLOCK_LABEL: Record<string, string> = {
	heading: "Heading",
	text: "Text",
	button: "Button",
	image: "Image",
	quote: "Quote",
	divider: "Divider",
	spacer: "Spacer",
	columns: "Columns",
};

const ADDABLE: { type: EmailBlock["type"]; label: string; make: () => EmailBlock }[] = [
	{ type: "heading", label: "Heading", make: () => ({ type: "heading", level: 2, text: [{ text: "" }] }) },
	{ type: "text", label: "Text", make: () => ({ type: "text", text: [{ text: "" }] }) },
	{ type: "button", label: "Button", make: () => ({
			type: "button",
			label: "Read more",
			href: "https://example.com",
		}),
	},
	{
		type: "image",
		label: "Image",
		make: () => ({
			type: "image",
			src: "https://placehold.co/600x200/png",
			alt: "",
		}),
	},
	{ type: "quote", label: "Quote", make: () => ({ type: "quote", text: [{ text: "" }] }) },
	{ type: "divider", label: "Divider", make: () => ({ type: "divider" }) },
	{ type: "spacer", label: "Spacer", make: () => ({ type: "spacer", size: "md" }) },
];

function runLabel(run: EmailInline): string {
	const marks = [
		run.bold ? "Bold" : null,
		run.italic ? "Italic" : null,
		run.href ? "Link" : null,
	].filter((mark) => mark !== null);

	return marks.length > 0 ? marks.join(" · ") : "Plain";
}

export function textOf(block: EmailBlock): string {
	if ("text" in block) return block.text.map((run) => run.text).join("");
	if (block.type === "button") return block.label;
	if (block.type === "image") return block.alt || block.src;
	if (block.type === "spacer") return block.size;
	if (block.type === "columns")
		return block.columns
			.map((column) => column.map(textOf).join(" ").trim())
			.filter((summary) => summary.length > 0)
			.join(" · ");
	return "";
}

function ShellRow({
	kind,
	detail,
	action,
	top,
}: {
	kind: string;
	detail: string;
	action?: ReactNode;
	top?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 bg-muted px-2.5 py-2",
				top ? "border-b" : "border-t",
			)}
		>
			<Icon icon={Locked} className="size-3 shrink-0 text-muted-foreground" />
			<span className="shrink-0 rounded-sm bg-background px-1.5 py-px text-muted-foreground text-xs">
				{kind}
			</span>
			<span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
				{detail}
			</span>
			{action}
		</div>
	);
}

function ImageUpload({
	upload,
	onUploaded,
}: {
	upload: (file: File) => Promise<string | null>;
	onUploaded: (url: string) => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);

	return (
		<div className="flex items-center gap-2">
			<input
				ref={input}
				type="file"
				accept="image/png,image/jpeg,image/gif"
				className="hidden"
				onChange={async (event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (!file) return;

					setBusy(true);
					const url = await upload(file);
					setBusy(false);
					if (url) onUploaded(url);
				}}
			/>
			<Button
				variant="outline"
				size="sm"
				disabled={busy}
				onClick={() => input.current?.click()}
			>
				{busy ? "Uploading…" : "Upload an image"}
			</Button>
			<span className="text-muted-foreground text-xs">
				PNG, JPEG or GIF. Outlook draws nothing else.
			</span>
		</div>
	);
}

export const DEFAULT_SHELL = {
	header: "Your workspace logo",
	footer: "Your postal address and the unsubscribe link",
} as const;

export function EmailBlockEditor({
	blocks,
	selected,
	onSelect,
	onChange,
	onUploadImage,
	shell,
}: {
	blocks: EmailBlock[];
	selected: number | null;
	onSelect: (index: number | null) => void;
	onChange: (blocks: EmailBlock[]) => void;
	onUploadImage?: (file: File) => Promise<string | null>;
	shell?: { header: string; footer: string; action?: ReactNode };
}) {
	const fieldId = useId();

	const latest = useRef(blocks);
	latest.current = blocks;

	const notify = useRef(onChange);
	notify.current = onChange;

	const update = (index: number, next: (block: EmailBlock) => EmailBlock) => {
		const rows = latest.current;
		const row = rows[index];
		if (!row) return;
		notify.current(
			rows.map((current, at) => (at === index ? next(row) : current)),
		);
	};

	const replace = (index: number, block: EmailBlock) =>
		update(index, () => block);

	const uploaded = (
		index: number,
		block: Extract<EmailBlock, { type: "image" }>,
		src: string,
	) => {
		const moved = latest.current.indexOf(block);
		update(moved >= 0 ? moved : index, (current) =>
			current.type === "image" ? { ...current, src } : current,
		);
	};

	const editRun = (
		index: number,
		block: Extract<EmailBlock, { text: EmailInline[] }>,
		runIndex: number,
		value: string,
	) =>
		replace(index, {
			...block,
			text: block.text.map((run, at) =>
				at === runIndex ? { ...run, text: value } : run,
			),
		});

	const move = (index: number, by: number) => {
		const target = index + by;
		if (target < 0 || target >= latest.current.length) return;
		const next = [...latest.current];
		const [row] = next.splice(index, 1);
		if (row) next.splice(target, 0, row);
		notify.current(next);
		onSelect(target);
	};

	const remove = (index: number) => {
		notify.current(latest.current.filter((_block, at) => at !== index));
		onSelect(null);
	};

	const add = (block: EmailBlock) => {
		notify.current([...latest.current, block]);
		onSelect(latest.current.length);
	};

	return (
		<div className="flex flex-col overflow-clip rounded-lg border">
			{shell ? (
				<ShellRow
					kind="Header"
					detail={shell.header}
					action={shell.action}
					top
				/>
			) : null}

			{blocks.map((block, index) => {
				const open = selected === index;

				return (
					<div
						key={`${block.type}-${index}`}
						className={cn("border-b last:border-b-0", open && "bg-muted/40")}
					>
						<button
							type="button"
							className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
							onClick={() => onSelect(open ? null : index)}
						>
							<Icon icon={Draggable} className="size-3 shrink-0 text-border" />
							<span className="shrink-0 rounded-sm bg-muted px-1.5 py-px text-muted-foreground text-xs">
								{BLOCK_LABEL[block.type] ?? block.type}
							</span>
							<span className="min-w-0 flex-1 truncate text-xs">
								{textOf(block) || <span className="text-muted-foreground">Empty</span>}
							</span>
						</button>

						{open ? (
							<div className="flex flex-col gap-2 px-2.5 pb-3">
								{"text" in block && block.text.length > 1
									? block.text.map((run, runIndex) => (
											<Field key={`${index}-${runIndex}`}>
												<FieldLabel htmlFor={`${fieldId}-${index}-${runIndex}`}>
													{runLabel(run)}
												</FieldLabel>
												<Textarea
													id={`${fieldId}-${index}-${runIndex}`}
													value={run.text}
													rows={2}
													onChange={(event) =>
														editRun(index, block, runIndex, event.target.value)
													}
												/>
											</Field>
										))
									: null}

								{"text" in block && block.text.length <= 1 ? (
									<Textarea
										value={block.text[0]?.text ?? ""}
										rows={block.type === "heading" ? 2 : 4}
										onChange={(event) =>
											replace(index, {
												...block,
												text: [{ ...block.text[0], text: event.target.value }],
											} as EmailBlock)
										}
									/>
								) : null}

								{block.type === "button" ? (
									<>
										<Input
											value={block.label}
											placeholder="Label"
											onChange={(event) =>
												replace(index, { ...block, label: event.target.value })
											}
										/>
										<Input
											value={block.href}
											placeholder="https://"
											onChange={(event) =>
												replace(index, { ...block, href: event.target.value })
											}
										/>
									</>
								) : null}

								{block.type === "columns" ? (
									<div className="flex flex-col gap-2">
										{block.columns.map((column, columnIndex) => (
											<ColumnBlocks
												key={`${index}-${columnIndex}`}
												blocks={column}
												onUploadImage={onUploadImage}
												onChange={(next) =>
													update(index, (current) =>
														current.type === "columns"
															? {
																	...current,
																	columns: current.columns.map((rows, at) =>
																		at === columnIndex ? next : rows,
																	),
																}
															: current,
													)
												}
											/>
										))}
									</div>
								) : null}

								{block.type === "image" ? (
									<>
										<Input
											value={block.src}
											placeholder="https://…/image.png"
											onChange={(event) =>
												replace(index, { ...block, src: event.target.value })
											}
										/>
										{onUploadImage ? (
											<ImageUpload
												onUploaded={(src) => uploaded(index, block, src)}
												upload={onUploadImage}
											/>
										) : null}
										<Input
											value={block.alt}
											placeholder="What the image shows"
											onChange={(event) =>
												replace(index, { ...block, alt: event.target.value })
											}
										/>
									</>
								) : null}

								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										aria-label="Move up"
										disabled={index === 0}
										onClick={() => move(index, -1)}
									>
										<Icon icon={ChevronUp} />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										aria-label="Move down"
										disabled={index === blocks.length - 1}
										onClick={() => move(index, 1)}
									>
										<Icon icon={ChevronDown} />
									</Button>
									<span className="flex-1" />
									<Button
										variant="ghost"
										size="icon"
										aria-label="Remove this block"
										onClick={() => remove(index)}
									>
										<Icon icon={Close} />
									</Button>
								</div>
							</div>
						) : null}
					</div>
				);
			})}

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-2 border-t px-2.5 py-2 text-left font-medium text-primary text-xs"
					>
						<Icon icon={Add} className="size-3" />
						Add block
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{ADDABLE.map((entry) => (
						<DropdownMenuItem
							key={entry.type}
							onSelect={() => add(entry.make())}
						>
							{entry.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			{shell ? (
				<ShellRow kind="Footer" detail={shell.footer} action={shell.action} />
			) : null}
		</div>
	);
}

function ColumnBlocks({
	blocks,
	onChange,
	onUploadImage,
}: {
	blocks: EmailBlock[];
	onChange: (blocks: EmailBlock[]) => void;
	onUploadImage?: (file: File) => Promise<string | null>;
}) {
	const [selected, setSelected] = useState<number | null>(null);

	return (
		<EmailBlockEditor
			blocks={blocks}
			selected={selected}
			onSelect={setSelected}
			onChange={onChange}
			onUploadImage={onUploadImage}
		/>
	);
}
