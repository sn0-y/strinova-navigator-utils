import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { prisma } from '_core/lib/prisma';

@ApplyOptions<Listener.Options>({
	name: 'scheduleGiveawayEnd',
	event: Events.ClientReady
})
export class ScheduleGiveawayEnd extends Listener {
	public override async run() {
		this.container.logger.info('[Giveaway][ScheduleGiveawayEnd] Scheduling pending giveaway endings...');

		const pendingGiveaways = await prisma.giveawayCollection.findMany({
			where: {
				endedAt: null
			}
		});

		const now = new Date();

		for (const giveaway of pendingGiveaways) {
			if (giveaway.endTime > now) {
				const delay = giveaway.endTime.getTime() - now.getTime();
				await this.container.tasks.create({ name: 'endGiveaway', payload: { giveaway: giveaway.id } }, delay);

				this.container.logger.info(`[Giveaway][ScheduleGiveawayEnd] Scheduled ending for giveaway ID ${giveaway.id} in ${delay}ms.`);
			} else {
				// If the end time has already passed, end the giveaway immediately
				await this.container.tasks.create({ name: 'endGiveaway', payload: { giveaway: giveaway.id } });
			}
		}
	}
}
