import { Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { CalendarService } from "./calendar.service";

@Router({ alias: "calendar" })
@UseMiddlewares(AuthMiddleware)
export class CalendarRouter {
	constructor(private readonly calendar: CalendarService) {}

	@Query()
	async agenda() {
		return this.calendar.agenda();
	}
}
