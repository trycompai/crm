import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { EnrichmentRouter } from "./enrichment.router";
import { EnrichmentService } from "./enrichment.service";

@Module({
	imports: [TrpcModule],
	providers: [EnrichmentService, EnrichmentRouter],
})
export class EnrichmentModule {}
