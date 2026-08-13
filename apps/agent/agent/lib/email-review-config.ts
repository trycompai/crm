import { EMAIL_WIDTH } from "@crm/email";

const SECOND_MS = 1_000;

export const EMAIL_REVIEW = {
	viewports: {
		desktop: { width: EMAIL_WIDTH, height: 640 },
		mobile: { width: 390, height: 660 },
	},

	capture: {
		maxHeightPx: 1800,
		jpegQuality: 70,
		loadTimeoutMs: 15 * SECOND_MS,
		launchTimeoutMs: 20 * SECOND_MS,
		imagePollMs: 200,
	},

	requests: {
		dnsTimeoutMs: 3 * SECOND_MS,
		ownOriginVariables: ["APP_URL"],
		maxReported: 5,
	},

	firstScreen: {
		imageDominancePercent: 60,
		minTextCharacters: 40,
		emptyCoveragePercent: 5,
		nearFoldFraction: 0.9,
		upscaleFactor: 1.15,
	},

	judge: {
		model: "google/gemini-2.5-flash-lite",
		url: "https://ai-gateway.vercel.sh/v1/chat/completions",
		maxOutputTokens: 700,
		timeoutMs: 30 * SECOND_MS,
	},

	chrome: {
		env: "CHROME_EXECUTABLE_PATH",
		knownPaths: [
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/google-chrome",
			"/usr/bin/chromium-browser",
			"/usr/bin/chromium",
		],
	},
} as const;
