const MOBILE_BREAKPOINT_PX = 768;

export const LAYOUT = {
	mobileMediaQuery: `(width < ${MOBILE_BREAKPOINT_PX}px)`,
	desktopMediaQuery: `(width >= ${MOBILE_BREAKPOINT_PX}px)`,
} as const;
