import type { Session, SessionUser } from "@crm/auth";
import type { Request } from "express";
import type { RequestPrincipal } from "../auth/request-principal";

export type BaseTrpcContext = {
	req?: Request;
	principal: RequestPrincipal | null;
	session: Session | null;
};

export type AuthedTrpcContext = BaseTrpcContext & {
	user: SessionUser;
	principal: RequestPrincipal;
};
