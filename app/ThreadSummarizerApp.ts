import {
	IAppAccessors,
	IConfigurationExtend,
	ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { SummarizeCommand } from './commands/SummarizeCommand';
import { settings } from './settings/settings';
import { ActionButton } from './enum/ActionButton';
import {  MessageActionContext, UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';


export class ThreadSummarizerApp extends App {
	constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
		super(info, logger, accessors);
	}

	public async extendConfiguration(configuration: IConfigurationExtend) {

        configuration.ui.registerButton({
            actionId: ActionButton.OPEN_SUMMARIZE_MODAL_ACTION,
            labelI18n: ActionButton.OPEN_SUMMARIZE_MODAL_LABEL,
            context: UIActionButtonContext.MESSAGE_ACTION,

            when: {
                messageActionContext: [
                    MessageActionContext.MESSAGE
                ]
            }
        })

        configuration.ui.registerButton({
            actionId: ActionButton.OPEN_SUMMARIZE_MODAL_ACTION,
            labelI18n: ActionButton.OPEN_SUMMARIZE_MODAL_LABEL,
            context: UIActionButtonContext.MESSAGE_BOX_ACTION,

            when: {
                messageActionContext: [
                    MessageActionContext.MESSAGE
                ]
            }
        })
		await Promise.all([
			...settings.map((setting) =>
				configuration.settings.provideSetting(setting)
			),
			configuration.slashCommands.provideSlashCommand(
				new SummarizeCommand(this)
			),
		]);
	}
}
