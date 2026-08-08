import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { FormsController } from "./forms.controller";
import { FormsRouter } from "./forms.router";
import { FormsService } from "./forms.service";

@Module({
	imports: [TrpcModule],
	controllers: [FormsController],
	providers: [FormsService, FormsRouter],
	exports: [FormsService],
})
export class FormsModule {}
