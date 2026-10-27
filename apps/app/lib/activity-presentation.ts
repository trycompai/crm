import type { ActivityType } from "@crm/db/enums";
import type { IconComponent } from "@crm/ui/components/icon";
import {
	ArrowRightIcon,
	CalendarDaysIcon,
	MailIcon,
	MessageSquareIcon,
	PhoneIcon,
	SquareCheckIcon,
	WandSparklesIcon,
} from "lucide-react";

type ActivityPresentation = Record<
	ActivityType,
	{ icon: IconComponent; label: string }
>;

const PRESENTATION: ActivityPresentation = {
	NOTE: { icon: MessageSquareIcon, label: "Note" },
	CALL: { icon: PhoneIcon, label: "Call" },
	EMAIL: { icon: MailIcon, label: "Email" },
	MEETING: { icon: CalendarDaysIcon, label: "Meeting" },
	TASK: { icon: SquareCheckIcon, label: "Task" },
	STAGE_CHANGE: { icon: ArrowRightIcon, label: "Stage change" },
	ENRICHMENT: { icon: WandSparklesIcon, label: "Enrichment" },
};

export function activityLabel(type: ActivityType): string {
	return PRESENTATION[type].label;
}

export function activityIcon(type: ActivityType): IconComponent {
	return PRESENTATION[type].icon;
}
