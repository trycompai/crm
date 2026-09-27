"use client";

import Add from "@carbon/icons-react/es/Add";
import Calendar from "@carbon/icons-react/es/Calendar";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Email from "@carbon/icons-react/es/Email";
import Home from "@carbon/icons-react/es/Home";
import Location from "@carbon/icons-react/es/Location";
import Phone from "@carbon/icons-react/es/Phone";
import Search from "@carbon/icons-react/es/Search";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Avatar, AvatarFallback } from "@crm/ui/components/avatar";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import { Input } from "@crm/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import type * as React from "react";
import { useMemo, useState } from "react";

type Stage = "New lead" | "Touring" | "Offer" | "Under contract";
type Lead = {
	id: number;
	name: string;
	initials: string;
	type: "Buyer" | "Seller";
	property: string;
	location: string;
	budget: string;
	stage: Stage;
	lastContact: string;
	color: string;
};

type Task = {
	id: number;
	title: string;
	contact: string;
	due: string;
	priority: "High" | "Normal";
	done: boolean;
};

const INITIAL_LEADS: Lead[] = [
	{
		id: 1,
		name: "Maya Chen",
		initials: "MC",
		type: "Buyer",
		property: "3 bed, light-filled home",
		location: "North Park",
		budget: "$850k–$1.1M",
		stage: "Touring",
		lastContact: "Today, 9:14 AM",
		color: "bg-emerald-100 text-emerald-800",
	},
	{
		id: 2,
		name: "Jordan Ellis",
		initials: "JE",
		type: "Seller",
		property: "Sunset bungalow",
		location: "Mission Hills",
		budget: "$1.2M est. value",
		stage: "New lead",
		lastContact: "Yesterday",
		color: "bg-amber-100 text-amber-800",
	},
	{
		id: 3,
		name: "Theo Williams",
		initials: "TW",
		type: "Buyer",
		property: "Condo with outdoor space",
		location: "Little Italy",
		budget: "$650k–$800k",
		stage: "Offer",
		lastContact: "Mon, Sep 22",
		color: "bg-sky-100 text-sky-800",
	},
	{
		id: 4,
		name: "Ava Patel",
		initials: "AP",
		type: "Seller",
		property: "Modern family home",
		location: "La Jolla",
		budget: "$1.85M est. value",
		stage: "Under contract",
		lastContact: "Mon, Sep 22",
		color: "bg-violet-100 text-violet-800",
	},
];

const INITIAL_TASKS: Task[] = [
	{
		id: 1,
		title: "Send inspection report",
		contact: "Maya Chen · 1428 Upas St",
		due: "Today",
		priority: "High",
		done: false,
	},
	{
		id: 2,
		title: "Prepare seller net sheet",
		contact: "Jordan Ellis · Sunset bungalow",
		due: "Today",
		priority: "Normal",
		done: false,
	},
	{
		id: 3,
		title: "Check in after offer",
		contact: "Theo Williams · 811 W G St",
		due: "Tomorrow",
		priority: "Normal",
		done: false,
	},
	{
		id: 4,
		title: "Coordinate final walkthrough",
		contact: "Ava Patel · La Jolla",
		due: "Sep 30",
		priority: "Normal",
		done: false,
	},
];

const STAGES: Stage[] = ["New lead", "Touring", "Offer", "Under contract"];

const stageTone: Record<Stage, string> = {
	"New lead": "bg-muted text-muted-foreground",
	Touring: "bg-sky-100 text-sky-800",
	Offer: "bg-amber-100 text-amber-800",
	"Under contract": "bg-emerald-100 text-emerald-800",
};

export function RealtyDashboard() {
	const [leads, setLeads] = useState(INITIAL_LEADS);
	const [tasks, setTasks] = useState(INITIAL_TASKS);
	const [query, setQuery] = useState("");
	const [stage, setStage] = useState<Stage | "All">("All");
	const [newLeadName, setNewLeadName] = useState("");

	const filteredLeads = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return leads.filter((lead) => {
			const matchesQuery =
				!normalized ||
				`${lead.name} ${lead.property} ${lead.location} ${lead.type}`
					.toLowerCase()
					.includes(normalized);
			return matchesQuery && (stage === "All" || lead.stage === stage);
		});
	}, [leads, query, stage]);

	const openTasks = tasks.filter((task) => !task.done).length;

	function addLead(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const name = newLeadName.trim();
		if (!name) return;
		const initials = name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0])
			.join("")
			.toUpperCase();
		setLeads((current) => [
			{
				id: Date.now(),
				name,
				initials,
				type: "Buyer",
				property: "Needs discovery",
				location: "San Diego",
				budget: "Set budget",
				stage: "New lead",
				lastContact: "Just now",
				color: "bg-rose-100 text-rose-800",
			},
			...current,
		]);
		setNewLeadName("");
	}

	return (
		<div className="flex flex-col gap-6">
			<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Pipeline summary">
				<MetricCard label="Active leads" value={leads.length.toString()} detail="2 buyers · 2 sellers" icon={<UserMultiple />} />
				<MetricCard label="Pipeline value" value="$4.1M" detail="Across 4 opportunities" icon={<Home />} />
				<MetricCard label="Tours this week" value="6" detail="2 need confirmation" icon={<Calendar />} />
				<MetricCard label="Open follow-ups" value={openTasks.toString()} detail="Keep your momentum" icon={<Checkmark />} />
			</section>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<Card className="min-w-0">
					<CardHeader>
						<div className="flex min-w-0 flex-col gap-3">
							<div>
								<CardTitle>Lead pipeline</CardTitle>
								<CardDescription>Move every relationship toward the next clear step.</CardDescription>
							</div>
							<div className="flex flex-col gap-2 sm:flex-row">
								<div className="relative min-w-0 flex-1">
									<Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
									<label className="sr-only" htmlFor="lead-search">Search leads</label>
									<Input id="lead-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, properties, or areas" className="pl-8" />
								</div>
								<form className="flex gap-2" onSubmit={addLead}>
									<label className="sr-only" htmlFor="new-lead">New lead name</label>
									<Input id="new-lead" value={newLeadName} onChange={(event) => setNewLeadName(event.target.value)} placeholder="Add a lead" />
									<Button type="submit" size="sm" aria-label="Add lead"><Add /></Button>
								</form>
							</div>
							<Tabs value={stage} onValueChange={(value) => setStage(value as Stage | "All")}>
								<TabsList variant="line">
									<TabsTrigger value="All">All <span className="text-muted-foreground">{leads.length}</span></TabsTrigger>
									{STAGES.map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}
								</TabsList>
							</Tabs>
						</div>
					</CardHeader>
					<CardPanel className="h-auto min-h-80 gap-3 overflow-auto p-3">
						{filteredLeads.length === 0 ? (
							<div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
								<Search className="size-5" aria-hidden="true" />
								<p className="text-sm">No leads match this view.</p>
								<Button variant="outline" size="sm" onClick={() => { setQuery(""); setStage("All"); }}>Clear filters</Button>
							</div>
						) : (
							filteredLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
						)}
					</CardPanel>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Today&apos;s focus</CardTitle>
						<CardDescription>Small actions that keep deals moving.</CardDescription>
					</CardHeader>
					<CardPanel className="h-auto gap-1 p-3">
						{tasks.map((task) => (
							<TaskRow key={task.id} task={task} onToggle={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))} />
						))}
					</CardPanel>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Upcoming showings</CardTitle>
					<CardDescription>Confirmed appointments and the details you need at a glance.</CardDescription>
				</CardHeader>
				<div className="grid gap-2 px-4 pb-4 md:grid-cols-3 md:px-6 md:pb-6">
					<Showing time="10:30 AM" person="Maya Chen" place="1428 Upas St" detail="Buyer tour · 3 bed" />
					<Showing time="1:00 PM" person="Theo Williams" place="811 W G St" detail="Offer strategy" />
					<Showing time="4:30 PM" person="Ava Patel" place="La Jolla" detail="Final walkthrough" />
				</div>
			</Card>
		</div>
	);
}

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
	return (
		<Card className="gap-2 rounded-lg border bg-card p-4">
			<div className="flex items-center justify-between text-muted-foreground">
				<span className="text-xs font-medium">{label}</span>
				<span aria-hidden="true" className="text-primary">{icon}</span>
			</div>
			<div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
			<p className="text-xs text-muted-foreground">{detail}</p>
		</Card>
	);
}

function LeadCard({ lead }: { lead: Lead }) {
	return (
		<article className="grid gap-3 rounded-lg border bg-background p-4 transition-colors hover:border-ring/50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
			<Avatar size="lg"><AvatarFallback className={lead.color}>{lead.initials}</AvatarFallback></Avatar>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="truncate text-sm font-medium">{lead.name}</h3>
					<Badge variant="outline">{lead.type}</Badge>
					<Badge className={stageTone[lead.stage]}>{lead.stage}</Badge>
				</div>
				<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<span className="inline-flex items-center gap-1"><Home className="size-3" aria-hidden="true" />{lead.property}</span>
					<span className="inline-flex items-center gap-1"><Location className="size-3" aria-hidden="true" />{lead.location}</span>
				</div>
			</div>
			<div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
				<span className="text-sm font-medium tabular-nums">{lead.budget}</span>
				<span className="text-xs text-muted-foreground">{lead.lastContact}</span>
			</div>
		</article>
	);
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
	return (
		<label className="flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/60">
			<Checkbox checked={task.done} onCheckedChange={onToggle} aria-label={`Complete ${task.title}`} />
			<span className="min-w-0 flex-1">
				<span className={`block text-sm ${task.done ? "text-muted-foreground line-through" : ""}`}>{task.title}</span>
				<span className="mt-0.5 block truncate text-xs text-muted-foreground">{task.contact}</span>
			</span>
			<span className={`shrink-0 text-xs ${task.priority === "High" && !task.done ? "font-medium text-destructive" : "text-muted-foreground"}`}>{task.due}</span>
		</label>
	);
}

function Showing({ time, person, place, detail }: { time: string; person: string; place: string; detail: string }) {
	return (
		<div className="flex items-center gap-3 rounded-lg border p-3">
			<div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-md bg-muted text-center">
				<Calendar className="size-4 text-primary" aria-hidden="true" />
				<span className="mt-0.5 text-[10px] font-medium">{time}</span>
			</div>
			<div className="min-w-0">
				<p className="truncate text-sm font-medium">{person}</p>
				<p className="truncate text-xs text-muted-foreground">{place} · {detail}</p>
			</div>
			<div className="ml-auto flex shrink-0 gap-1 text-muted-foreground" aria-label="Contact actions">
				<Button variant="ghost" size="icon-xs" aria-label={`Email ${person}`}><Email /></Button>
				<Button variant="ghost" size="icon-xs" aria-label={`Call ${person}`}><Phone /></Button>
			</div>
		</div>
	);
}
