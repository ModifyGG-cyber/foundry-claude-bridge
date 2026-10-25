import type { SendChatMessageParams, SendChatMessageResult } from '@/commands/types';

interface FoundrySpeaker {
  alias: string | undefined;
  actor: string | undefined;
  scene: string | undefined;
}

interface FoundryChatMessageData {
  content: string;
  speaker?: FoundrySpeaker;
  flavor?: string;
  whisper?: string[];
  style?: number;
}

interface FoundryChatMessage {
  id: string;
}

interface ChatMessageConstructor {
  create(data: FoundryChatMessageData): Promise<FoundryChatMessage | undefined>;
  getSpeaker(): FoundrySpeaker;
}

type ChatStyles = { IC: number; OOC: number; EMOTE: number };

interface ChatGame {
  actors: { get(id: string): { name: string } | undefined };
}

declare const ChatMessage: ChatMessageConstructor;
declare const game: ChatGame;

// Foundry v12+ keeps the styles in CONST.CHAT_MESSAGE_STYLES; ChatMessage has no STYLE property.
const FALLBACK_STYLES: ChatStyles = { OOC: 1, IC: 2, EMOTE: 3 };

function chatStyles(): ChatStyles {
  const constants = (globalThis as { CONST?: { CHAT_MESSAGE_STYLES?: ChatStyles } }).CONST;
  return constants?.CHAT_MESSAGE_STYLES ?? FALLBACK_STYLES;
}

const STYLE_MAP: Record<string, 'IC' | 'OOC' | 'EMOTE'> = {
  ic: 'IC',
  ooc: 'OOC',
  emote: 'EMOTE'
};

export async function sendChatMessageHandler(params: SendChatMessageParams): Promise<SendChatMessageResult> {
  if (!params.content.trim()) {
    throw new Error('Message content cannot be empty');
  }

  const messageData: FoundryChatMessageData = {
    content: params.content
  };

  const speaker = ChatMessage.getSpeaker();

  if (params.actorId) {
    const actor = game.actors.get(params.actorId);
    speaker.alias = actor?.name ?? params.speaker ?? speaker.alias;
    speaker.actor = params.actorId;
  } else if (params.speaker) {
    speaker.alias = params.speaker;
  }

  messageData.speaker = speaker;

  if (params.flavor) {
    messageData.flavor = params.flavor;
  }

  if (params.whisperTo?.length) {
    messageData.whisper = params.whisperTo;
  }

  if (params.type) {
    const styleKey = STYLE_MAP[params.type];
    if (styleKey) {
      messageData.style = chatStyles()[styleKey];
    }
  }

  const message = await ChatMessage.create(messageData);

  if (!message) {
    throw new Error('Chat message creation was cancelled by Foundry (a module hook may have vetoed it)');
  }

  return {
    messageId: message.id,
    sent: true
  };
}
