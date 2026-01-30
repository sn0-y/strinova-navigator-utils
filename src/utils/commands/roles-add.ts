import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, Awaitable, Command } from "@sapphire/framework";
import { Attachment, AttachmentBuilder, ChatInputCommandInteraction, GuildMember, Role } from "discord.js";
import axios from "axios";

@ApplyOptions<Command.Options>({
    name: 'roles-add',
    preconditions: [['leadModsOnly', 'staffOnly']],
    requiredClientPermissions: ['ManageRoles', 'SendMessages']
})
export class RolesAdd extends Command {
    public override registerApplicationCommands(registry: ApplicationCommandRegistry): Awaitable<void> {
        registry.registerChatInputCommand((builder) => builder
            .setName(this.name)
            .setDescription('Add roles to a large amount of users')
            .addAttachmentOption((option) => option.setName('file').setDescription('The file containing the users, separated by newlines or ,').setRequired(true))
            .addRoleOption((option) => option.setName('role').setDescription('The role to add to the users').setRequired(true))
            .addStringOption((option) => option.setName('parse-type').setDescription('How should the file be read').setChoices({
                name: 'User IDs', value: 'uid'
            }, { name: 'Usernames', value: 'usernames' }))
        );
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: ['Ephemeral'] })

        // Extract Options
        const fileAttachment = interaction.options.getAttachment('file', true);
        const role = interaction.options.getRole('role', true) as Role;

        const isConverted = interaction.options.getString('parse-type') === 'uid';

        if (!interaction.guild) {
            await interaction.editReply('This command can only be used in a server.');
            return;
        }

        let fileContent = '';
        try {
            fileContent = await this.downloadFile(fileAttachment);
        } catch (error) {
            this.container.logger.error(error);
            await interaction.editReply('Failed to download the file.');
            return;
        }

        const entries = fileContent.split(/[\r\n,]+/).map(s => s.trim()).filter(s => s.length > 0);

        if (entries.length === 0) {
            await interaction.editReply('The file appears to be empty.');
            return;
        }

        await interaction.editReply(`Processing ${entries.length} entries...`);

        type ResultStatus = 'Added' | 'Unchanged' | 'Failed' | 'NotFound';
        const results: { identifier: string, status: ResultStatus, reason?: string }[] = [];

        // Pre-fetch logic
        let membersMap: Map<string, GuildMember> | undefined;

        if (isConverted) {
            // IDs
            try {
                const fetched = await interaction.guild.members.fetch({ user: entries });
                membersMap = fetched;
            } catch (err) {
                this.container.logger.warn(`Bulk fetch failed or partial: ${err}`);
                membersMap = new Map();
            }
        } else {
            // Usernames
            try {
                await interaction.editReply('Fetching members to resolve usernames...');
                const fetched = await interaction.guild.members.fetch();
                membersMap = new Map();
                for (const [_, member] of fetched) {
                    membersMap.set(member.user.username, member);
                }
            } catch (err) {
                await interaction.editReply('Failed to fetch guild members for username resolution.');
                return;
            }
        }

        for (const entry of entries) {
            let member: GuildMember | undefined;

            if (isConverted) {
                member = membersMap?.get(entry);
                if (!member) {
                    member = interaction.guild.members.cache.get(entry);
                }
            } else {
                member = membersMap?.get(entry);
            }

            if (!member) {
                results.push({ identifier: entry, status: 'NotFound' });
                continue;
            }

            if (member.roles.cache.has(role.id)) {
                results.push({ identifier: entry, status: 'Unchanged' });
                continue;
            }

            try {
                await member.roles.add(role);
                results.push({ identifier: entry, status: 'Added' });
            } catch (err) {
                results.push({ identifier: entry, status: 'Failed', reason: (err as any).message });
            }
        }

        const csvRows = ['Identifier,Status,Reason'];
        for (const r of results) {
            csvRows.push(`${r.identifier},${r.status},${r.reason || ''}`);
        }
        const buffer = Buffer.from(csvRows.join('\n'), 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: 'results.csv' });

        await interaction.editReply({
            content: `Finished processing. Success: ${results.filter(r => r.status === 'Added').length}, Failed: ${results.filter(r => r.status === 'Failed').length}, Unchanged: ${results.filter(r => r.status === 'Unchanged').length}, Not Found: ${results.filter(r => r.status === 'NotFound').length}`,
            files: [attachment]
        });
    }

    private async downloadFile(file: Attachment): Promise<string> {
        const { data } = await axios.get(file.url, { responseType: 'text' });
        return data;
    }
}