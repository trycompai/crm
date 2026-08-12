export const LIFECYCLE_ROLES = [
	"qualify",
	"engage",
	"advance",
	"close",
] as const;

export type LifecycleRole = (typeof LIFECYCLE_ROLES)[number];

export function isLifecycleRole(value: unknown): value is LifecycleRole {
	return (
		typeof value === "string" &&
		(LIFECYCLE_ROLES as readonly string[]).includes(value)
	);
}
