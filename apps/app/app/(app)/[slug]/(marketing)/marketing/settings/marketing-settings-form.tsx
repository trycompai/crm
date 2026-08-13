"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Combobox } from "@crm/ui/components/combobox";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import {
	SendingDomainActions,
	SendingDomains,
} from "@/components/marketing/sending-domains";
import { describeMissing } from "@/lib/marketing-setup-steps";
import { useTRPC } from "@/lib/trpc/client";

const NO_QUIET = "none";

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
	value: String(hour),
	label: `${String(hour).padStart(2, "0")}:00`,
}));

const ZONES = Intl.supportedValuesOf("timeZone").map((zone) => ({
	value: zone,
	label: zone.replace(/_/g, " "),
}));

export function MarketingSettingsForm() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const settings = useQuery(trpc.marketing.settings.queryOptions());
	const domain = useQuery(trpc.marketing.domain.queryOptions());

	const [fromName, setFromName] = useState("");
	const [fromAddress, setFromAddress] = useState("");
	const [replyTo, setReplyTo] = useState("");
	const [postalAddress, setPostalAddress] = useState("");
	const [key, setKey] = useState("");
	const [sendsPerMinute, setSendsPerMinute] = useState("300");
	const [dailyCap, setDailyCap] = useState("0");
	const [quietStart, setQuietStart] = useState(NO_QUIET);
	const [quietEnd, setQuietEnd] = useState(NO_QUIET);
	const [timeZone, setTimeZone] = useState("UTC");

	const fromNameId = useId();
	const fromAddressId = useId();
	const replyToId = useId();
	const postalId = useId();
	const keyId = useId();
	const rateId = useId();
	const capId = useId();
	const opensId = useId();
	const clicksId = useId();

	const data = settings.data;

	useEffect(() => {
		if (!data) return;
		setFromName(data.fromName ?? "");
		setFromAddress(data.fromAddress ?? "");
		setReplyTo(data.replyTo ?? "");
		setPostalAddress(data.postalAddress ?? "");
		setSendsPerMinute(String(data.sendsPerMinute));
		setDailyCap(String(data.dailyCap ?? 0));
		setQuietStart(
			data.quietStart === null ? NO_QUIET : String(data.quietStart),
		);
		setQuietEnd(data.quietEnd === null ? NO_QUIET : String(data.quietEnd));
		setTimeZone(data.timeZone);
	}, [data]);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.marketing.settings.queryKey(),
		});

	const saveKey = useMutation(
		trpc.marketing.saveKey.mutationOptions({
			onSuccess: (result) => {
				setKey("");
				toast.success(
					result.state !== "valid"
						? "Saved. Resend did not confirm the key, so watch the first send."
						: data?.connection === "oauth"
							? "Key saved as the fallback. Sends keep going through the Resend sign-in."
							: "Resend is connected.",
				);
				void invalidate();
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

	const setTracking = useMutation(
		trpc.marketing.setTracking.mutationOptions({
			onSuccess: () => {
				toast.success("Changed it in Resend.");
				void queryClient.invalidateQueries({
					queryKey: trpc.marketing.domain.queryKey(),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveSending = useMutation(
		trpc.marketing.saveSending.mutationOptions({
			onSuccess: () => {
				toast.success("Saved.");
				void invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const saveIdentity = useMutation(
		trpc.marketing.saveIdentity.mutationOptions({
			onSuccess: () => {
				toast.success("Saved.");
				void invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (settings.isPending) return <Spinner />;
	if (!data) return null;

	return (
		<div className="flex max-w-2xl flex-col gap-6">
			{!data.sendable.ok ? (
				<Card>
					<CardHeader>
						<CardTitle>Marketing cannot send yet</CardTitle>
						<CardDescription>
							Still to do: {describeMissing(data.sendable.missing)}.
						</CardDescription>
					</CardHeader>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Resend</CardTitle>
					<CardDescription>
						Resend carries the mail and reports what happened to it.
					</CardDescription>
					<CardAction>
						<Button
							disabled={connect.isPending}
							onClick={() => connect.mutate()}
						>
							{connect.isPending ? <Spinner /> : null}
							{data.connection === "oauth" ? "Sign in again" : "Sign in"}
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent className="gap-4">
					<p className="text-muted-foreground text-xs">
						{data.connection === "oauth"
							? "Signed in to Resend. Sends go through the sign-in, and a pasted key is only the fallback. Revoke the sign-in in Resend at any time."
							: "Signing in grants access on Resend's own screen, and you can revoke it there."}
					</p>

					<Field>
						<FieldLabel htmlFor={keyId}>
							{data.connection === "oauth"
								? "Or keep a fallback API key"
								: "Or paste an API key"}
						</FieldLabel>
						<Input
							id={keyId}
							value={key}
							placeholder={data.apiKeyMask ?? "re_…"}
							onChange={(event) => setKey(event.target.value)}
							autoComplete="off"
						/>
					</Field>

					<Button
						variant="outline"
						size="sm"
						className="self-start"
						disabled={!key.trim() || saveKey.isPending}
						onClick={() => saveKey.mutate({ key })}
					>
						{saveKey.isPending ? <Spinner /> : null}
						{data.connection === "oauth"
							? "Save fallback key"
							: data.connection === "key"
								? "Replace key"
								: "Use this key"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Who it comes from</CardTitle>
					<CardDescription>
						Replies go to the sender. Your postal address goes in the footer.
					</CardDescription>
					<CardAction>
						<Button
							disabled={saveIdentity.isPending}
							onClick={() =>
								saveIdentity.mutate({
									fromName,
									fromAddress,
									replyTo: replyTo || null,
									postalAddress,
								})
							}
						>
							{saveIdentity.isPending ? <Spinner /> : null}
							Save
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent>
					<FieldGroup>
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
								placeholder="hello@send.example.com"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={replyToId}>Fallback reply-to</FieldLabel>
							<Input
								id={replyToId}
								value={replyTo}
								onChange={(event) => setReplyTo(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={postalId}>Postal address</FieldLabel>
							<Input
								id={postalId}
								value={postalAddress}
								onChange={(event) => setPostalAddress(event.target.value)}
								placeholder="Comp AI · 2261 Market Street, San Francisco"
							/>
						</Field>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Sending domain</CardTitle>
					<CardDescription>
						Pick a domain Resend has verified. Resend owns the DNS.
					</CardDescription>
					<CardAction>
						<SendingDomainActions />
					</CardAction>
				</CardHeader>
				<CardContent>
					<SendingDomains />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>How fast it leaves</CardTitle>
					<CardDescription>
						Quiet hours hold campaigns. A test or a one-off always goes.
					</CardDescription>
					<CardAction>
						<Button
							disabled={saveSending.isPending}
							onClick={() =>
								saveSending.mutate({
									sendsPerMinute: Number(sendsPerMinute) || 1,
									dailyCap: Number(dailyCap) || null,
									quietStart:
										quietStart === NO_QUIET ? null : Number(quietStart),
									quietEnd: quietEnd === NO_QUIET ? null : Number(quietEnd),
									timeZone,
								})
							}
						>
							{saveSending.isPending ? <Spinner /> : null}
							Save
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={rateId}>Sends a minute</FieldLabel>
							<Input
								id={rateId}
								type="number"
								min={1}
								max={6000}
								value={sendsPerMinute}
								onChange={(event) => setSendsPerMinute(event.target.value)}
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={capId}>
								Most emails per person a day
							</FieldLabel>
							<Input
								id={capId}
								type="number"
								min={0}
								max={50}
								value={dailyCap}
								onChange={(event) => setDailyCap(event.target.value)}
							/>
						</Field>

						<div className="grid grid-cols-2 gap-4">
							<Field>
								<FieldLabel>Quiet from</FieldLabel>
								<Select value={quietStart} onValueChange={setQuietStart}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_QUIET}>No quiet hours</SelectItem>
										{HOURS.map((hour) => (
											<SelectItem key={hour.value} value={hour.value}>
												{hour.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field>
								<FieldLabel>Quiet until</FieldLabel>
								<Select value={quietEnd} onValueChange={setQuietEnd}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_QUIET}>No quiet hours</SelectItem>
										{HOURS.map((hour) => (
											<SelectItem key={hour.value} value={hour.value}>
												{hour.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						</div>

						<Field>
							<FieldLabel>Time zone</FieldLabel>
							<Combobox
								options={ZONES}
								value={timeZone}
								onValueChange={setTimeZone}
								placeholder="Pick a time zone"
							/>
						</Field>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Open and click tracking</CardTitle>
					<CardDescription>
						These switch the Resend domain. Apple Mail inflates every open rate.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Field orientation="horizontal">
						<FieldLabel htmlFor={opensId}>Track opens</FieldLabel>
						<Switch
							id={opensId}
							checked={domain.data?.openTracking ?? false}
							disabled={!domain.data?.name || setTracking.isPending}
							onCheckedChange={(next) =>
								setTracking.mutate({ openTracking: next })
							}
						/>
					</Field>
					<Field orientation="horizontal">
						<FieldLabel htmlFor={clicksId}>Track clicks</FieldLabel>
						<Switch
							id={clicksId}
							checked={domain.data?.clickTracking ?? false}
							disabled={!domain.data?.name || setTracking.isPending}
							onCheckedChange={(next) =>
								setTracking.mutate({ clickTracking: next })
							}
						/>
					</Field>
					<p className="text-muted-foreground text-xs">
						Click tracking rewrites every link in the body. The List-Unsubscribe
						header is untouched either way.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
