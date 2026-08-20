import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { SavedViewsRouter } from "./saved-views.router";
import { SavedViewsService } from "./saved-views.service";

@Module({
	imports: [TrpcModule],
	providers: [SavedViewsService, SavedViewsRouter],
	exports: [SavedViewsService],
})
export class SavedViewsModule {}
