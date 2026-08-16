import { Module } from "@nestjs/common";
import { DevSessionController } from "./dev-session.controller";

@Module({
	controllers: [DevSessionController],
})
export class DevSessionModule {}
