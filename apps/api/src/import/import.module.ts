import { Module } from "@nestjs/common";
import { FieldsModule } from "../fields/fields.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportRouter } from "./import.router";
import { ImportService } from "./import.service";

@Module({
	imports: [FieldsModule, TrpcModule],
	providers: [ImportService, ImportRouter],
	exports: [ImportService],
})
export class ImportModule {}
