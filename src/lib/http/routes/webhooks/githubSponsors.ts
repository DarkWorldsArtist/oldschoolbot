import { TextChannel } from 'discord.js';

import { syncLinkedAccounts } from '../../../../mahoji/mahojiSettings';
import { boxFrenzy } from '../../../boxFrenzy';
import { Channel } from '../../../constants';
import { addPatronLootTime } from '../../../doubleLoot';
import { patreonTask } from '../../../patreon';
import { sendToChannelID } from '../../../util/webhook';
import { GithubSponsorsWebhookData } from '../../githubApiTypes';
import { FastifyServer } from '../../types';
import { getUserIdFromGithubID, parseStrToTier, verifyGithubSecret } from '../../util';

const githubSponsors = (server: FastifyServer) =>
	server.route({
		method: 'POST',
		url: '/webhooks/github_sponsors',
		async handler(request, reply) {
			const isVerified = verifyGithubSecret(JSON.stringify(request.body), request.headers['x-hub-signature']);
			if (!isVerified) {
				throw reply.badRequest();
			}
			const data = request.body as GithubSponsorsWebhookData;
			const userID = await getUserIdFromGithubID(data.sender.id.toString());
			// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
			switch (data.action) {
				case 'created': {
					const tier = parseStrToTier(data.sponsorship.tier.name);
					if (!tier) return;
					let effectiveTier = tier - 1;
					sendToChannelID(Channel.NewSponsors, {
						content: `${data.sender.login}[${data.sender.id}] became a Tier ${effectiveTier} sponsor.`
					});
					if (userID) {
						await patreonTask.givePerks(userID, tier);
						addPatronLootTime(tier, await mUserFetch(userID));
					}

					for (const id of [Channel.BSOChannel, Channel.BSOGeneral]) {
						boxFrenzy(
							globalClient.channels.cache.get(id) as TextChannel,
							`🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉
🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉
${data.sender.login} became a Github sponsor, as a reward for everyone, here is a box frenzy, guess any of the items in the image for a mystery box.
🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉
🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉`,
							tier * 3
						);
					}
					break;
				}
				case 'tier_changed':
				case 'pending_tier_change': {
					const from = parseStrToTier(data.changes!.tier.from.name);
					const to = parseStrToTier(data.sponsorship.tier.name);
					if (!from || !to) return;
					sendToChannelID(Channel.NewSponsors, {
						content: `${data.sender.login}[${data.sender.id}] changed their sponsorship from Tier ${
							from - 1
						} to Tier ${to - 1}.`
					});
					if (userID) {
						await patreonTask.changeTier(userID, from, to);
					}
					break;
				}
				case 'cancelled': {
					const tier = parseStrToTier(data.sponsorship.tier.name);
					if (!tier) return;
					if (userID) {
						await patreonTask.removePerks(userID);
					}

					sendToChannelID(Channel.NewSponsors, {
						content: `${data.sender.login}[${data.sender.id}] cancelled being a Tier ${tier - 1} sponsor. ${
							userID ? 'Removing perks.' : "Cant remove perks because couldn't find discord user."
						}`
					});

					break;
				}
			}
			syncLinkedAccounts();
			return reply.send({});
		},
		config: {}
	});

export default githubSponsors;
