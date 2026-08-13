"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import Logo from "@crm/ui/components/logo";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import {
	SendingDomainActions,
	SendingDomains,
} from "@/components/marketing/sending-domains";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { STEPS } from "./steps";

export function SetupWizard({ step }: { step: string }) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();

	const settings = useQuery(trpc.marketing.settings.queryOptions());
	const domain = useQuery(trpc.marketing.domain.queryOptions());

	const [key, setKey] = useState("");
	const [fromName, setFromName] = useState("");
	const [fromAddress, setFromAddress] = useState("");
	const [postalAddress, setPostalAddress] = useState("");
	const [tested, setTested] = useState(false);

	const keyId = useId();
	const fromNameId = useId();
	const fromAddressId = useId();
	const postalId = useId();

	const data = settings.data;
	const domainStatus = domain.data?.status ?? "not_started";

	useEffect(() => {
		if (!data) return;
		setFromName(data.fromName ?? "");
		setFromAddress(data.fromAddress ?? "");
		setPostalAddress(data.postalAddress ?? "");
	}, [data]);

	useEffect(() => {
		if (step !== "identity" || fromAddress !== "" || !data?.sendingDomain)
			return;
		setFromAddress(`hello@${data.sendingDomain}`);
	}, [step, fromAddress, data?.sendingDomain]);

	const index = STEPS.findIndex((candidate) => candidate.id === step);
	const goto = (next: number) => {
		const target = STEPS[Math.max(0, Math.min(STEPS.length - 1, next))];
		if (target) router.push(workspaceUrl(`/marketing/setup/${target.id}`));
	};

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.marketing.settings.queryKey(),
		});

	const saveKey = useMutation(
		trpc.marketing.saveKey.mutationOptions({
			onSuccess: async () => {
				setKey("");
				await invalidate();
				goto(index + 1);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const connect = useMutation(
		trpc.marketing.connectStart.mutationOptions({
			onSuccess: (result) => {
				window.location.href = result.url;
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveIdentity = useMutation(
		trpc.marketing.saveIdentity.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				goto(index + 1);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const recheck = useMutation(
		trpc.marketing.verifyDomain.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.marketing.domain.queryKey(),
				});
				toast.success(
					result.status === "verified"
						? "Verified. You can send from it."
						: `Still ${result.status.replace(/_/g, " ")}. Finish it in Resend.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const finish = useMutation(
		trpc.marketing.markOnboarded.mutationOptions({
			onSuccess: () => router.push(workspaceUrl("/marketing/campaigns")),
			onError: (error) => toast.error(error.message),
		}),
	);

	const sendTest = useMutation(
		trpc.marketing.sendTest.mutationOptions({
			onSuccess: (result) => {
				setTested(true);
				toast.success(`Sent to ${result.to}. Check your inbox.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (settings.isPending || !data) {
		return (
			<div className="flex h-svh items-center justify-center">
				<Spinner />
			</div>
		);
	}

	const satisfied =
		step === "connect"
			? data.connected || key.trim().length > 0
			: step === "identity"
				? fromAddress.trim().length > 0 && postalAddress.trim().length > 0
				: step === "domain"
					? domainStatus === "verified"
					: step === "test"
						? tested
						: true;

	const advance = () => {
		if (step === "connect" && key.trim()) return saveKey.mutate({ key });
		if (step === "identity") {
			return saveIdentity.mutate({
				fromName,
				fromAddress,
				replyTo: null,
				postalAddress,
			});
		}
		if (step === "test") return finish.mutate();
		return goto(index + 1);
	};

	const busy = saveKey.isPending || saveIdentity.isPending || finish.isPending;

	return (
		<div className="flex h-svh flex-col bg-background">
			<header className="shrink-0">
				<div className="flex items-center gap-3 px-6 py-4">
					<Link
						href={workspaceUrl()}
						aria-label="Homepage"
						className="flex size-6 shrink-0 items-center justify-center text-foreground"
					>
						<Logo className="size-5" />
					</Link>

					<nav
						aria-label="Setup steps"
						className="flex min-w-0 flex-1 items-center gap-2 text-xs"
					>
						{STEPS.map((candidate, position) => (
							<span key={candidate.id} className="flex items-center gap-2">
								{position > 0 ? (
									<span className="text-muted-foreground">/</span>
								) : null}
								<span
									className={cn(
										"flex items-center gap-1.5",
										position <= index
											? "text-foreground"
											: "text-muted-foreground",
									)}
								>
									<span
										className={cn(
											"size-1.5 shrink-0 rounded-sm",
											position < index
												? "bg-foreground"
												: position === index
													? "bg-primary"
													: "bg-border",
										)}
									/>
									{candidate.title}
								</span>
							</span>
						))}
					</nav>

					<Button
						asChild
						variant="ghost"
						size="sm"
						className="shrink-0 gap-1.5"
					>
						<Link href={workspaceUrl("/")}>
							<Icon icon={Close} className="size-3.5" />
							Close setup wizard
						</Link>
					</Button>
				</div>

				<div className="h-px w-full bg-border">
					<div
						className="h-px bg-primary transition-all"
						style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
					/>
				</div>
			</header>

			<main className="flex min-h-0 flex-1 justify-center overflow-y-auto px-6 py-14">
				<div className={cn("w-full max-w-xl", step === "test" && "m-auto")}>
					{step === "connect" ? (
						<Step
							title="Connect Resend"
							blurb="Resend carries the mail and reports what happened to it. Sign in and grant access, or paste an API key."
						>
							<Button
								className="self-start"
								disabled={connect.isPending}
								onClick={() => connect.mutate()}
							>
								{connect.isPending ? <Spinner /> : null}
								{data.connection === "oauth"
									? "Sign in to Resend again"
									: "Sign in to Resend"}
							</Button>

							<span className="text-muted-foreground text-xs">
								{data.connection === "oauth"
									? "Signed in. You can revoke this in Resend at any time."
									: "You grant access on Resend's own screen, and you can revoke it there at any time."}
							</span>

							<Field>
								<FieldLabel htmlFor={keyId}>Or paste an API key</FieldLabel>
								<Input
									id={keyId}
									value={key}
									placeholder={data.apiKeyMask ?? "re_…"}
									onChange={(event) => setKey(event.target.value)}
									autoComplete="off"
								/>
							</Field>
						</Step>
					) : null}

					{step === "identity" ? (
						<Step
							title="Who it comes from"
							blurb="The postal address is required by law on marketing email. It goes on every send."
						>
							<Field>
								<FieldLabel htmlFor={fromNameId}>From name</FieldLabel>
								<Input
									id={fromNameId}
									value={fromName}
									onChange={(event) => setFromName(event.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={fromAddressId}>From address</FieldLabel>
								<Input
									id={fromAddressId}
									value={fromAddress}
									onChange={(event) => setFromAddress(event.target.value)}
									placeholder={
										data.sendingDomain
											? `hello@${data.sendingDomain}`
											: "hello@send.example.com"
									}
								/>
								{data.sendingDomain ? (
									<span className="text-muted-foreground text-xs">
										Resend will only send from {data.sendingDomain}.
									</span>
								) : null}
							</Field>
							<Field>
								<FieldLabel htmlFor={postalId}>Postal address</FieldLabel>
								<Input
									id={postalId}
									value={postalAddress}
									onChange={(event) => setPostalAddress(event.target.value)}
								/>
							</Field>
						</Step>
					) : null}

					{step === "domain" ? (
						<Step
							title="Your sending domain"
							blurb="Pick a domain you have already verified in Resend. Resend owns the DNS, so there is nothing to paste here."
						>
							<div className="flex flex-col gap-2">
								<div className="flex items-center gap-1 self-end">
									<SendingDomainActions />
								</div>
								<SendingDomains />
							</div>

							{domain.data?.name ? (
								<div className="flex flex-col gap-3">
									<p className="text-muted-foreground text-xs">
										Sending from <b>{domain.data.name}</b> —{" "}
										{(domain.data.status ?? "pending").replace(/_/g, " ")}.
									</p>

									{domainStatus === "verified" ? null : (
										<Button
											variant="outline"
											className="self-start"
											disabled={recheck.isPending}
											onClick={() => recheck.mutate()}
										>
											{recheck.isPending ? <Spinner /> : null}
											Check again
										</Button>
									)}
								</div>
							) : null}
						</Step>
					) : null}

					{step === "test" ? (
						<Step
							title="Send yourself one"
							blurb="Nothing goes to a customer until you schedule a campaign. This proves your header, your footer and the unsubscribe link all render."
						>
							{data.sendable.ok ? (
								<>
									<Button
										variant="outline"
										className="self-start"
										disabled={sendTest.isPending}
										onClick={() => sendTest.mutate()}
									>
										{sendTest.isPending ? <Spinner /> : null}
										{tested ? "Send another" : "Send me a test"}
									</Button>
									{tested ? (
										<p className="text-muted-foreground text-xs">
											It went through the same path a campaign takes. If it is
											not there in a minute, check the sending domain.
										</p>
									) : null}
								</>
							) : (
								<p className="text-muted-foreground text-xs">
									Still to do: {data.sendable.missing.join(", ")}. Go back and
									finish those, and this step can prove the rest works.
								</p>
							)}
						</Step>
					) : null}
				</div>
			</main>

			<footer className="flex shrink-0 items-center justify-between border-t px-6 py-4">
				<Button
					variant="ghost"
					disabled={index === 0}
					onClick={() => goto(index - 1)}
					className="gap-1.5"
				>
					<Icon icon={ArrowLeft} className="size-3.5" />
					Back
				</Button>

				<Button
					disabled={!satisfied || busy}
					onClick={advance}
					className="gap-1.5"
				>
					{busy ? <Spinner /> : null}
					{step === "test" ? "Finish" : "Continue"}
					{step === "test" ? null : (
						<Icon icon={ArrowRight} className="size-3.5" />
					)}
				</Button>
			</footer>
		</div>
	);
}

function Step({
	title,
	blurb,
	children,
}: {
	title: string;
	blurb: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-medium text-2xl tracking-tight">{title}</h1>
				<p className="text-muted-foreground">{blurb}</p>
			</div>
			<FieldGroup>{children}</FieldGroup>
		</div>
	);
}
