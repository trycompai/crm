import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "api/app-router";

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
