import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { CalendarRouter } from "./calendar.router";
import { CalendarService } from "./calendar.service";

@Module({
	imports: [TrpcModule],
	providers: [CalendarService, CalendarRouter],
})
export class CalendarModule {}
