import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { SlackRouter } from "./slack.router";
import { SlackChannelsService } from "./slack-channels.service";
import { SlackConnectionService } from "./slack-connection.service";
import { SlackEventsController } from "./slack-events.controller";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [SlackEventsController],
	providers: [SlackChannelsService, SlackConnectionService, SlackRouter],
	exports: [SlackConnectionService],
})
export class SlackModule {}
