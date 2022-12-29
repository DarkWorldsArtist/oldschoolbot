import { ChatInputCommandInteraction } from 'discord.js';
import { roll } from 'e';
import { CommandResponse } from 'mahoji/dist/lib/structures/ICommand';
import { Bank } from 'oldschooljs';

import { SupportServer } from '../../../config';
import { COINS_ID, Emoji } from '../../../lib/constants';
import { dailyResetTime } from '../../../lib/MUser';
import dailyRoll from '../../../lib/simulation/dailyTable';
import { channelIsSendable, formatDuration, isWeekend } from '../../../lib/util';
import { deferInteraction } from '../../../lib/util/interactionReply';
import { makeBankImage } from '../../../lib/util/makeBankImage';
import { updateGPTrackSetting } from '../../mahojiSettings';

export function isUsersDailyReady(user: MUser): { isReady: true } | { isReady: false; durationUntilReady: number } {
	const currentDate = new Date().getTime();
	const lastVoteDate = Number(user.user.lastDailyTimestamp);
	const difference = currentDate - lastVoteDate;

	if (difference < dailyResetTime) {
		const duration = Date.now() - (lastVoteDate + dailyResetTime);
		return { isReady: false, durationUntilReady: duration };
	}

	return { isReady: true };
}

async function reward(user: MUser, triviaCorrect = true): CommandResponse {
	const guild = globalClient.guilds.cache.get(SupportServer);
	const member = await guild?.members.fetch(user.id).catch(() => null);

	const loot = dailyRoll(3, triviaCorrect);

	const bonuses = [];

	if (isWeekend()) {
		loot[COINS_ID] *= 2;
		bonuses.push(Emoji.MoneyBag);
	}

	if (member) {
		loot[COINS_ID] = Math.floor(loot[COINS_ID] * 1.5);
		bonuses.push(Emoji.OSBot);
	}

	if (user.user.minion_hasBought) {
		loot[COINS_ID] /= 1.5;
	}

	if (roll(73)) {
		loot[COINS_ID] = Math.floor(loot[COINS_ID] * 1.73);
		bonuses.push(Emoji.Joy);
	}

	if (roll(5000)) {
		if (roll(2)) {
			bonuses.push(Emoji.Bpaptu);
		} else {
			loot[COINS_ID] += 1_000_000_000;
			bonuses.push(Emoji.Diamond);
		}
	}

	if (!triviaCorrect) {
		loot[COINS_ID] = 0;
	} else if (loot[COINS_ID] <= 1_000_000_000) {
		// Correct daily gives 10% more cash if the jackpot is not won
		loot[COINS_ID] = Math.floor(loot[COINS_ID] * 1.1);
	}

	// Ensure amount of GP is an integer
	loot[COINS_ID] = Math.floor(loot[COINS_ID]);

	// Check to see if user is iron and remove GP if true.
	if (user.isIronman) {
		delete loot[COINS_ID];
	}

	const correct = triviaCorrect ? 'correct' : 'incorrect';
	const reward = triviaCorrect
		? "I've picked you some random items as a reward..."
		: "Even though you got it wrong, here's a little reward...";

	let dmStr = `${bonuses.join('')} **${Emoji.Diango} Diango says..** That's ${correct}! ${reward}\n`;

	const hasSkipper = user.usingPet('Skipper') || user.bank.amount('Skipper') > 0;
	if (!user.isIronman && triviaCorrect && hasSkipper) {
		loot[COINS_ID] = Math.floor(loot[COINS_ID] * 1.5);
		dmStr +=
			'\n<:skipper:755853421801766912> Skipper has negotiated with Diango and gotten you 50% extra GP from your daily!';
	}

	if (loot[COINS_ID] > 0) {
		updateGPTrackSetting('gp_daily', loot[COINS_ID]);
	} else {
		delete loot[COINS_ID];
	}

	const { itemsAdded, previousCL } = await transactItems({
		userID: user.id,
		collectionLog: true,
		itemsToAdd: new Bank(loot)
	});
	const image = await makeBankImage({
		bank: itemsAdded,
		title: `${user.rawUsername}'s Daily`,
		previousCL,
		showNewCL: true
	});
	return { content: `${dmStr}\nYou received ${new Bank(loot)}`, files: [image.file] };
}

export async function dailyCommand(
	interaction: ChatInputCommandInteraction | null,
	channelID: string,
	user: MUser
): CommandResponse {
	if (interaction) await deferInteraction(interaction);
	const channel = globalClient.channels.cache.get(channelID.toString());
	if (!channelIsSendable(channel)) return 'Invalid channel.';
	const check = isUsersDailyReady(user);
	if (!check.isReady) {
		return `**${Emoji.Diango} Diango says...** You can claim your next daily in ${formatDuration(
			check.durationUntilReady
		)}.`;
	}

	await user.update({
		lastDailyTimestamp: new Date().getTime()
	});

	return reward(user);
}
