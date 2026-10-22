import type { Session, SessionUser } from "@crm/auth/auth";
import type { Request } from "express";

export type BaseTrpcContext = {
	req?: Request;
	session: Session | null;
};

export type AuthedTrpcContext = BaseTrpcContext & {
	user: SessionUser;
};
