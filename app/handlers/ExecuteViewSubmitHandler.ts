import {
	IUIKitResponse,
	UIKitViewSubmitInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import {
	IHttp,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ThreadSummarizerApp } from '../ThreadSummarizerApp';
import { SummarizeModalEnum } from '../enum/modal/summarizeModal';
import { notifyMessage } from '../helpers/notifyMessage';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IMessageRaw } from '@rocket.chat/apps-engine/definition/messages';
import { createTextCompletion } from '../helpers/createTextCompletion';
import { createAssignedTasksPrompt, createFileSummaryPrompt, createFollowUpQuestionsPrompt, createParticipantsSummaryPrompt, createSummaryPrompt, createSummaryPromptByTopics } from '../constants/prompts';
import { ROOM_ID_KEY, THREAD_ID_KEY } from '../enum/keys';
import { getData } from '../lib/dataStore';

export class ExecuteViewSubmitHandler {
	private context: UIKitViewSubmitInteractionContext;

	constructor(
		protected readonly app: ThreadSummarizerApp,
		protected readonly read: IRead,
		protected readonly http: IHttp,
		protected readonly persistence: IPersistence,
		protected readonly modify: IModify,
		context: UIKitViewSubmitInteractionContext,
	) {
		this.context = context;
	}

	public async handleActions(context: UIKitViewSubmitInteractionContext): Promise<IUIKitResponse> {
		const { view, user} = context.getInteractionData();
        const{ roomId } = await getData(
            this.read.getPersistenceReader(),
            user.id,
            ROOM_ID_KEY,
        );

        const { threadId } = await getData(
            this.read.getPersistenceReader(),
            user.id,
            THREAD_ID_KEY,
        )

        if(roomId){
        const room = (await this.read.getRoomReader().getById(roomId)) as IRoom;

		const ViewData = view.id.split('---');
		const viewId = ViewData[0].trim();

		let unreadCount: number | undefined;
		let startDate: Date | undefined;
		let usernames: string[] | undefined;
		const now = new Date();
        const filter = view.state?.[SummarizeModalEnum.FILTER_SUMMARIES_DROPDOWN_BLOCK_ID]?.[
            SummarizeModalEnum.FILTER_SUMMARIES_DROPDOWN_ACTION_ID
        ]
        const anyMatchedUsername = false;

        if(viewId === SummarizeModalEnum.VIEW_ID) {
                        switch (filter) {
                            case 'today':
                                startDate = new Date(
                                    now.getFullYear(),
                                    now.getMonth(),
                                    now.getDate(),
                                    0,
                                    0,
                                    0,
                                    0
                                );
                                break;
                            case 'week':
                                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                                break;
                            case 'unread':
                                unreadCount = await this.read
                                    .getUserReader()
                                    .getUserUnreadMessageCount(user.id);
                                break;
                            default:
                                usernames = view.state?.[SummarizeModalEnum.USER_LISTS_BLOCK_ID]?.[
                                    SummarizeModalEnum.USER_LISTS_ACTION_ID
                                ]
                        }
                    }

                    const addOns = await this.app
                        .getAccessors()
                        .environmentReader.getSettings()
                        .getValueById('add-ons');
                    const xAuthToken = await this.app
                        .getAccessors()
                        .environmentReader.getSettings()
                        .getValueById('x-auth-token');
                    const xUserId = await this.app
                        .getAccessors()
                        .environmentReader.getSettings()
                        .getValueById('x-user-id');


                    let messages: string;
                    if (!threadId) {
                        messages = await this.getRoomMessages(
                            room,
                            this.read,
                            user,
                            this.http,
                            addOns,
                            xAuthToken,
                            xUserId,
                            startDate,
                            unreadCount,
                            usernames,
                            anyMatchedUsername
                        );
                    } else {
                        messages = await this.getThreadMessages(
                            room,
                            this.read,
                            user,
                            this.http,
                            threadId,
                            addOns,
                            xAuthToken,
                            xUserId,
                            startDate,
                            unreadCount,
                            usernames,
                            anyMatchedUsername
                        );
                    }

                    if (!messages || messages.trim().length === 0) {
                        await notifyMessage(
                            room,
                            this.read,
                            user,
                            'There are no messages to summarize in this channel.',
                            threadId
                        );
                        return this.context.getInteractionResponder().successResponse();;
                    }

                    await notifyMessage(room, this.read, user, messages, threadId);

                    let summary: string;
                    if (!threadId) {
                        const prompt = createSummaryPromptByTopics(messages);
                        summary = await createTextCompletion(
                            this.app,
                            room,
                            this.read,
                            user,
                            this.http,
                            prompt,
                            threadId
                        );
                    } else {
                        const prompt = createSummaryPrompt(messages);
                        summary = await createTextCompletion(
                            this.app,
                            room,
                            this.read,
                            user,
                            this.http,
                            prompt,
                            threadId
                        );
                    }
                    await notifyMessage(room, this.read, user, summary, threadId);

                    if (addOns.includes('assigned-tasks')) {
                        const assignedTasksPrompt = createAssignedTasksPrompt(messages);
                        const assignedTasks = await createTextCompletion(
                            this.app,
                            room,
                            this.read,
                            user,
                            this.http,
                            assignedTasksPrompt,
                            threadId
                        );
                        await notifyMessage(room, this.read, user, assignedTasks, threadId);
                    }

                    if (addOns.includes('follow-up-questions')) {
                        const followUpQuestionsPrompt = createFollowUpQuestionsPrompt(messages);
                        const followUpQuestions = await createTextCompletion(
                            this.app,
                            room,
                            this.read,
                            user,
                            this.http,
                            followUpQuestionsPrompt,
                            threadId
                        );
                        await notifyMessage(room, this.read, user, followUpQuestions, threadId);
                    }

                    if (addOns.includes('participants-summary')) {
                        const participantsSummaryPrompt =
                            createParticipantsSummaryPrompt(messages);
                        const participantsSummary = await createTextCompletion(
                            this.app,
                            room,
                            this.read,
                            user,
                            this.http,
                            participantsSummaryPrompt,
                            threadId
                        );
                        await notifyMessage(room, this.read, user, participantsSummary, threadId);
                    }

                }

    return this.context.getInteractionResponder().successResponse();


    }

    private async getFileSummary(
            fileId: string,
            read: IRead,
            room: IRoom,
            user: IUser,
            http: IHttp,
            xAuthToken: string,
            xUserId: string,
            threadId?: string
        ): Promise<string> {
            const uploadReader = read.getUploadReader();
            const file = await uploadReader.getById(fileId);
            if (file && file.type === 'text/plain') {
                const response = await fetch(file.url, {
                    method: 'GET',
                    headers: {
                        'X-Auth-Token': xAuthToken,
                        'X-User-Id': xUserId,
                    },
                });
                const fileContent = await response.text();
                const fileSummaryPrompt = createFileSummaryPrompt(fileContent);
                return createTextCompletion(
                    this.app,
                    room,
                    read,
                    user,
                    http,
                    fileSummaryPrompt,
                    threadId
                );
            }
            return 'File type is not supported';
        }

        private async getRoomMessages(
            room: IRoom,
            read: IRead,
            user: IUser,
            http: IHttp,
            addOns: string[],
            xAuthToken: string,
            xUserId: string,
            startDate?: Date,
            unreadCount?: number,
            usernames?: string[],
            anyMatchedUsername?: boolean
        ): Promise<string> {
            const messages: IMessageRaw[] = await read
                .getRoomReader()
                .getMessages(room.id, {
                    limit: Math.min(unreadCount || 100, 100),
                    sort: { createdAt: 'asc' },
                });

            let filteredMessages = messages;

            if (usernames) {
                filteredMessages = messages.filter((message) => {
                    const isMatched = usernames.includes(message.sender.username);
                    if (isMatched) {
                        anyMatchedUsername = true;
                    }
                    return isMatched;
                });

                if (!anyMatchedUsername) {
                    return `Please enter a valid command!
                    You can try:
                    \t 1. /chat-summary
                    \t 2. /chat-summary today
                    \t 3. /chat-summary week
                    \t 4. /chat-summary unread
                    \t 5. /chat-summary @<username> or /chat-summary @<username1> @<username2>
                    \t 6. /chat-summary help
                    \t 7. /chat-summary help <question>`;
                }
            }

            if (startDate) {
                const today = new Date();
                filteredMessages = messages.filter((message) => {
                    const createdAt = new Date(message.createdAt);
                    return createdAt >= startDate && createdAt <= today;
                });
            }

            const messageTexts: string[] = [];
            for (const message of filteredMessages) {
                if (message.text) {
                    messageTexts.push(
                        `Message at ${message.createdAt}\n${message.sender.name}: ${message.text}\n`
                    );
                }
                if (addOns.includes('file-summary') && message.file) {
                    if (!xAuthToken || !xUserId) {
                        await notifyMessage(
                            room,
                            read,
                            user,
                            'Personal Access Token and User ID must be filled in settings to enable file summary add-on'
                        );
                        continue;
                    }
                    const fileSummary = await this.getFileSummary(
                        message.file._id,
                        read,
                        room,
                        user,
                        http,
                        xAuthToken,
                        xUserId
                    );
                    messageTexts.push('File Summary: ' + fileSummary);
                }
            }
            return messageTexts.join('\n');
        }

        private async getThreadMessages(
            room: IRoom,
            read: IRead,
            user: IUser,
            http: IHttp,
            threadId: string,
            addOns: string[],
            xAuthToken: string,
            xUserId: string,
            startDate?: Date,
            unreadCount?: number,
            usernames?: string[],
            anyMatchedUsername?: boolean
        ): Promise<string> {
            const threadReader = read.getThreadReader();
            const thread = await threadReader.getThreadById(threadId);
            if (!thread) {
                await notifyMessage(room, read, user, 'Thread not found');
                throw new Error('Thread not found');
            }

            let filteredMessages = thread;
            if (usernames) {
                filteredMessages = thread.filter((message) => {
                    const isMatched = usernames.includes(message.sender.username);
                    if (isMatched) {
                        anyMatchedUsername = true;
                    }
                    return isMatched;
                });

                if (!anyMatchedUsername) {
                    return `Please enter a valid command!
                    You can try:
                    \t 1. /chat-summary
                    \t 2. /chat-summary today
                    \t 3. /chat-summary week
                    \t 4. /chat-summary unread
                    \t 5. /chat-summary <username>`;
                }
            }
            if (startDate) {
                const today = new Date();
                filteredMessages = thread.filter((message) => {
                    if (!message.createdAt) return false;
                    const createdAt = new Date(message.createdAt);
                    return createdAt >= startDate && createdAt <= today;
                });
            }

            if (unreadCount && unreadCount > 0) {
                if (unreadCount > 100) {
                    unreadCount = 100;
                }
                filteredMessages = filteredMessages.slice(-unreadCount);
            }

            const messageTexts: string[] = [];
            for (const message of filteredMessages) {
                if (message.text) {
                    messageTexts.push(`${message.sender.name}: ${message.text}`);
                }
                if (addOns.includes('file-summary') && message.file) {
                    if (!xAuthToken || !xUserId) {
                        await notifyMessage(
                            room,
                            read,
                            user,
                            'Personal Access Token and User ID must be filled in settings to enable file summary add-on'
                        );
                        continue;
                    }
                    const fileSummary = await this.getFileSummary(
                        message.file._id,
                        read,
                        room,
                        user,
                        http,
                        xAuthToken,
                        xUserId,
                        threadId
                    );
                    messageTexts.push('File Summary: ' + fileSummary);
                }
            }

            // threadReader repeats the first message once, so here we remove it
            if (messageTexts.length > 0) {
                messageTexts.shift();
            }
            return messageTexts.join('\n');
        }



}
