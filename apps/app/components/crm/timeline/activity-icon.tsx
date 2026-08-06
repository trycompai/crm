import type { ActivityType } from "@crm/db/enums";
import { Icon } from "@crm/ui/components/icon";
import { activityIcon } from "@/lib/activity-presentation";

export function ActivityIcon({ type }: { type: ActivityType }) {
	return <Icon icon={activityIcon(type)} />;
}
