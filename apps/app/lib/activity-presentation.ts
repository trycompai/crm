import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Chat from "@carbon/icons-react/es/Chat";
import Email from "@carbon/icons-react/es/Email";
import Events from "@carbon/icons-react/es/Events";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import Phone from "@carbon/icons-react/es/Phone";
import Task from "@carbon/icons-react/es/Task";
import type { ActivityType } from "@crm/db/enums";
import type { CarbonIcon } from "@crm/ui/components/icon";

const PRESENTATION: Record<ActivityType, { icon: CarbonIcon; label: string }> =
	{
		NOTE: { icon: Chat, label: "Note" },
		CALL: { icon: Phone, label: "Call" },
		EMAIL: { icon: Email, label: "Email" },
		MEETING: { icon: Events, label: "Meeting" },
		TASK: { icon: Task, label: "Task" },
		STAGE_CHANGE: { icon: ArrowRight, label: "Stage change" },
		ENRICHMENT: { icon: MagicWand, label: "Enrichment" },
	};

export function activityLabel(type: ActivityType): string {
	return PRESENTATION[type].label;
}

export function activityIcon(type: ActivityType): CarbonIcon {
	return PRESENTATION[type].icon;
}
