import { type RequestHandler, raw } from "express";
import { SLACK } from "./slack-config";

export const slackEventsBody: RequestHandler = raw({
	type: "*/*",
	limit: SLACK.events.maxBodyBytes,
});
