import { apollo } from "./apollo";
import type { Provider } from "./contact-details";
import { dropcontact } from "./dropcontact";
import { hunter } from "./hunter";
import { lusha } from "./lusha";
import { website } from "./website";
import { zoominfo } from "./zoominfo";

export const CONTACT_DETAILS_PROVIDERS: readonly Provider[] = [
	hunter,
	apollo,
	lusha,
	dropcontact,
	zoominfo,
	website,
];
