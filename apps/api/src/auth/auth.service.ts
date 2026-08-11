import { isWorkspaceEmail } from "@crm/auth";
import type { Db } from "@crm/db";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import {
	ForbiddenException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import type { Cache } from "cache-manager";
import { InjectDatabase } from "../database/database.constants";

export interface UserProfile {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image: string | null;
	createdAt: string;
}

const PROFILE_TTL_MS = 5 * 60_000;

const profileKey = (userId: string) => `auth:profile:${userId}`;

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	async getProfile(userId: string): Promise<UserProfile> {
		const key = profileKey(userId);
		const cached = await this.cache.get<UserProfile>(key);

		if (cached) {
			this.assertAllowed(cached.email);
			return cached;
		}

		this.logger.debug({ message: "Profile cache miss", userId });

		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				name: true,
				email: true,
				emailVerified: true,
				image: true,
				createdAt: true,
			},
		});

		if (!user) {
			this.logger.warn({ message: "Session user no longer exists", userId });
			throw new NotFoundException(`No user with id ${userId}.`);
		}

		this.assertAllowed(user.email);

		const profile: UserProfile = {
			...user,
			createdAt: user.createdAt.toISOString(),
		};

		await this.cache.set(key, profile, PROFILE_TTL_MS);

		return profile;
	}

	async invalidateProfile(userId: string): Promise<void> {
		await this.cache.del(profileKey(userId));
		this.logger.debug({ message: "Invalidated cached profile", userId });
	}

	private assertAllowed(email: string): void {
		if (!isWorkspaceEmail(email)) {
			throw new ForbiddenException(
				"This account is no longer allowed to access this CRM.",
			);
		}
	}
}
