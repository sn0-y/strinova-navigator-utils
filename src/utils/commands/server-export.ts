import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, Command } from "@sapphire/framework";
import { AttachmentBuilder, Awaitable } from "discord.js";

@ApplyOptions<Command.Options>({
    name: 'server-export',
    preconditions: [['leadModsOnly', 'staffOnly']],
    requiredClientPermissions: ['ManageRoles', 'SendMessages']
})
export class ServerExport extends Command {
    public override registerApplicationCommands(registry: ApplicationCommandRegistry): Awaitable<void> {
        registry.registerChatInputCommand((builder) => builder
            .setName(this.name)
            .setDescription('Export the server\'s members, roles, and channels as JSON')
        );
    }

    public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: ['Ephemeral'] });

        if (!interaction.guild) {
            await interaction.editReply('This command can only be used in a server.');
            return;
        }

        const guild = interaction.guild;

        const exportData = {
            id: guild.id,
            name: guild.name,
            members: (await guild.members.fetch()).map(member => ({
                id: member.id,
                username: member.user.tag,
                roles: member.roles.cache.map(role => role.id)
            })),
            roles: guild.roles.cache.map(role => ({
                id: role.id,
                name: role.name,
                permissions: role.permissions.bitfield
            })),
            channels: guild.channels.cache.map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type
            }))
        };

        const exportJson = JSON.stringify(exportData, null, 2);
        const exportBuffer = Buffer.from(exportJson, 'utf-8');
        const attachment = new AttachmentBuilder(exportBuffer, { name: `${guild.name}-export.json` });

        await interaction.editReply({ content: 'Here is the server export:', files: [attachment] });
    }
}