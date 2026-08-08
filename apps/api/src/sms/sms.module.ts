import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { SmsController } from "./sms.controller";
import { SmsRouter } from "./sms.router";
import { SmsService } from "./sms.service";
import { TwilioClient } from "./twilio.client";

@Module({
	imports: [TrpcModule],
	controllers: [SmsController],
	providers: [SmsService, SmsRouter, TwilioClient],
	exports: [SmsService, TwilioClient],
})
export class SmsModule {}
